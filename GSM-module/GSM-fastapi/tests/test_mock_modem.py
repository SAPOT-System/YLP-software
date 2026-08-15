import json
import os
import re
import select
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest
import serial

from mock_modem import (
    INBOUND_BODY_MAX_BYTES,
    VirtualModem,
    normalize_body,
    parse_send_sms,
    start_http_server,
    valid_phone_number,
)


requires_pty = pytest.mark.skipif(
    os.name != "posix", reason="PTY modem integration tests require POSIX"
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class OutputReader:
    def __init__(self, stream):
        self.stream = stream
        self.buffer = b""

    def readline(self, timeout: float = 2.0) -> str:
        deadline = time.monotonic() + timeout
        while b"\n" not in self.buffer:
            remaining = deadline - time.monotonic()
            assert remaining > 0, "timed out waiting for emulator output"
            ready, _, _ = select.select([self.stream], [], [], remaining)
            assert ready, "timed out waiting for emulator output"
            self.buffer += os.read(self.stream.fileno(), 4096)
        line, self.buffer = self.buffer.split(b"\n", 1)
        return line.decode("utf-8")


class ModemProcess:
    def __init__(self, port_file=None):
        self.port_file = port_file

    def __enter__(self):
        command = [sys.executable, "-u", "mock_modem.py"]
        if self.port_file:
            command.extend(["--port-file", str(self.port_file)])
        self.process = subprocess.Popen(
            command,
            cwd=PROJECT_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.output = OutputReader(self.process.stdout)
        first_line = self.output.readline()
        self.path = re.fullmatch(r"Virtual modem port: (/dev/pts/\d+)", first_line).group(1)
        assert self.output.readline() == (
            f"Run the gateway with: SERIAL_PORT={self.path} python main.py"
        )
        return self

    def readline(self, timeout: float = 2.0) -> str:
        return self.output.readline(timeout)

    def __exit__(self, *_):
        self.process.send_signal(signal.SIGINT)
        self.process.wait(timeout=2)
        assert self.process.returncode == 0
        self.process.stdout.close()
        self.process.stderr.close()


def _open_modem(path: str) -> serial.Serial:
    port = serial.Serial(path, 9600, timeout=1)
    assert port.readline() == b"GSM_READY\n"
    assert port.readline() == b"NETWORK_OK\n"
    return port


def test_parse_send_sms_preserves_pipes():
    assert parse_send_sms("SEND_SMS|+639171234567|one|two|three") == (
        "+639171234567", "one|two|three"
    )


def test_phone_validation_and_inbound_normalization_match_firmware_frames():
    assert valid_phone_number("+639171234567")
    assert not valid_phone_number("09171234567")
    assert normalize_body("one|two\nthree", inbound=True) == "one/two three"
    assert normalize_body("x" * (INBOUND_BODY_MAX_BYTES + 1), inbound=True) is None


def test_virtual_modem_stores_successful_messages_and_reset_clears_them():
    modem = VirtualModem()
    assert modem.receive_outbound("+639171234567", "hello") == (True, "")
    assert modem.messages("+639171234567")[0]["direction"] == "received"
    modem.reset()
    assert modem.messages("+639171234567") == []


def test_virtual_modem_state_transitions_emit_gateway_events():
    modem = VirtualModem()
    modem.attach(99)
    _, error, frames = modem.update({"network_connected": False})
    assert error is None
    assert frames == [b"NETWORK_LOST\n"]
    _, error, frames = modem.update({"network_connected": True})
    assert error is None
    assert frames == [b"GSM_READY\n", b"NETWORK_OK\n"]
    _, error, frames = modem.update({"sim_present": False})
    assert error is None
    assert frames == [b"SIM_MISSING\n"]


def test_virtual_phone_http_reports_validation_errors_and_modem_state():
    modem = VirtualModem()
    server = start_http_server(modem, "127.0.0.1", 0)
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        with urlopen(f"{base_url}/api/modem") as response:
            assert json.load(response)["gsm_ready"] is False
        request = Request(
            f"{base_url}/api/messages",
            data=b'{"phone_number":"not-a-number","body":"hi"}',
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with pytest.raises(HTTPError) as error:
            urlopen(request)
        assert error.value.code == 400
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.parametrize("line", ["OTHER|+63|body", "SEND_SMS|+63", "SEND_SMS||body"])
def test_parse_send_sms_rejects_malformed_commands(line):
    assert parse_send_sms(line) is None


@requires_pty
def test_emulator_writes_port_file_before_printing_path(tmp_path):
    port_file = tmp_path / "modem-port"
    with ModemProcess(port_file) as modem:
        assert port_file.read_text() == modem.path


@requires_pty
def test_emulator_confirms_fragmented_and_batched_commands():
    with ModemProcess() as modem:
        with _open_modem(modem.path) as port:
            port.write(b"SEND_SMS|+639171234567|fragment")
            port.write(b"ed body\nSEND_SMS|+639188888888|second|body\n")
            port.flush()

            assert port.readline() == b"SMS_SENT|+639171234567\n"
            assert port.readline() == b"SMS_SENT|+639188888888\n"
            assert modem.readline() == "SMS request to +639171234567: fragmented body"
            assert modem.readline() == "SMS request to +639188888888: second|body"


@requires_pty
def test_emulator_reannounces_after_reconnect_and_ignores_malformed_input():
    with ModemProcess() as modem:
        with _open_modem(modem.path) as port:
            port.write(b"NOT_A_COMMAND\n")
            port.flush()
            assert modem.readline() == "Ignored modem command: 'NOT_A_COMMAND'"
            assert port.read(1) == b""

            port.write(b"SEND_SMS|+639171234567|still works\n")
            port.flush()
            assert port.readline() == b"SMS_SENT|+639171234567\n"
            assert modem.readline() == "SMS request to +639171234567: still works"

        time.sleep(0.25)
        with _open_modem(modem.path) as port:
            assert port.read(1) == b""
