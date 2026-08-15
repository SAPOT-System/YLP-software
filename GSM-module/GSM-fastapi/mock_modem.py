"""PTY-backed virtual GSM modem and browser phone for local development."""

import argparse
import errno
import json
import os
import re
import select
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

if os.name == "posix":
    import pty
    import tty


DISCONNECTED_POLL_SECONDS = 0.1
ATTACH_SETTLE_SECONDS = 0.05
E164_PATTERN = re.compile(r"^\+[0-9]{7,15}$")
INBOUND_BODY_MAX_BYTES = 127  # GSM_BUF is 128 bytes, including its NUL terminator.
OUTBOUND_RESULT_MODES = {"success", "NO_PROMPT", "TIMEOUT"}


def valid_phone_number(number: object) -> bool:
    return isinstance(number, str) and bool(E164_PATTERN.fullmatch(number))


def normalize_body(body: object, *, inbound: bool = False) -> Optional[str]:
    if not isinstance(body, str):
        return None
    normalized = body.replace("\r", " ").replace("\n", " ")
    if not normalized.strip():
        return None
    if inbound:
        normalized = normalized.replace("|", "/")
        if len(normalized.encode("utf-8")) > INBOUND_BODY_MAX_BYTES:
            return None
    return normalized


def parse_send_sms(line: str) -> Optional[tuple[str, str]]:
    """Return the destination and body for a valid outbound SMS frame."""
    parts = line.split("|", 2)
    if len(parts) != 3 or parts[0] != "SEND_SMS" or not valid_phone_number(parts[1]):
        return None
    body = normalize_body(parts[2])
    if body is None:
        return None
    return parts[1], body


class VirtualModem:
    """Thread-safe modem state shared by the PTY loop and browser server."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._master_fd: Optional[int] = None
        self._attached = False
        self._sim_present = True
        self._network_connected = True
        self._outbound_result_mode = "success"
        self._messages: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._next_message_id = 1

    def attach(self, master_fd: int) -> None:
        with self._lock:
            self._master_fd = master_fd
            self._attached = True

    def detach(self) -> None:
        with self._lock:
            self._attached = False
            self._master_fd = None

    def status(self) -> dict[str, Any]:
        with self._lock:
            usable = self._sim_present and self._network_connected
            return {
                "connected": self._attached,
                "sim_present": self._sim_present,
                "network_connected": self._network_connected,
                "gsm_ready": self._attached and usable,
                "outbound_result_mode": self._outbound_result_mode,
            }

    def _add_message(self, number: str, direction: str, body: str, status: str) -> dict[str, Any]:
        message = {
            "id": self._next_message_id,
            "phone_number": number,
            "direction": direction,
            "body": body,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
        }
        self._next_message_id += 1
        self._messages[number].append(message)
        return message

    def messages(self, number: str) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._messages.get(number, ()))

    def reset(self) -> None:
        with self._lock:
            self._messages.clear()
            self._next_message_id = 1

    def receive_outbound(self, number: str, body: str) -> tuple[bool, str]:
        with self._lock:
            if not self._sim_present:
                return False, "SIM_MISSING"
            if not self._network_connected:
                return False, "NETWORK_LOST"
            if self._outbound_result_mode != "success":
                return False, self._outbound_result_mode
            self._add_message(number, "received", body, "delivered")
            return True, ""

    def inject_inbound(self, number: object, body: object) -> tuple[Optional[dict[str, Any]], Optional[str]]:
        if not valid_phone_number(number):
            return None, "phone_number must be E.164 format e.g. +639171234567"
        normalized = normalize_body(body, inbound=True)
        if normalized is None:
            return None, f"body must be non-empty and at most {INBOUND_BODY_MAX_BYTES} UTF-8 bytes"
        with self._lock:
            if not self._sim_present:
                return None, "SIM_MISSING"
            if not self._network_connected:
                return None, "NETWORK_LOST"
            if not self._attached or self._master_fd is None:
                return None, "MODEM_DISCONNECTED"
            message = self._add_message(number, "sent", normalized, "sent")
            master_fd = self._master_fd
        if not _write_frames(master_fd, [f"SMS_RECEIVED|{number}|{normalized}\n".encode("utf-8")]):
            with self._lock:
                self._attached = False
                self._master_fd = None
            return None, "MODEM_DISCONNECTED"
        return message, None

    def update(self, changes: dict[str, Any]) -> tuple[Optional[dict[str, Any]], Optional[str], list[bytes]]:
        allowed = {"sim_present", "network_connected", "outbound_result_mode"}
        if not changes or not set(changes).issubset(allowed):
            return None, "provide sim_present, network_connected, or outbound_result_mode", []
        frames: list[bytes] = []
        with self._lock:
            if "sim_present" in changes and not isinstance(changes["sim_present"], bool):
                return None, "sim_present must be a boolean", []
            if "network_connected" in changes and not isinstance(changes["network_connected"], bool):
                return None, "network_connected must be a boolean", []
            if "outbound_result_mode" in changes and changes["outbound_result_mode"] not in OUTBOUND_RESULT_MODES:
                return None, "outbound_result_mode must be success, NO_PROMPT, or TIMEOUT", []
            before_usable = self._sim_present and self._network_connected
            self._sim_present = changes.get("sim_present", self._sim_present)
            self._network_connected = changes.get("network_connected", self._network_connected)
            self._outbound_result_mode = changes.get("outbound_result_mode", self._outbound_result_mode)
            after_usable = self._sim_present and self._network_connected
            if self._attached:
                if not self._sim_present:
                    frames.append(b"SIM_MISSING\n")
                elif not self._network_connected:
                    frames.append(b"NETWORK_LOST\n")
                elif not before_usable and after_usable:
                    frames.extend([b"GSM_READY\n", b"NETWORK_OK\n"])
            return self.status(), None, frames

    def readiness_frames(self) -> list[bytes]:
        with self._lock:
            if not self._sim_present:
                return [b"SIM_MISSING\n"]
            if not self._network_connected:
                return [b"GSM_READY\n", b"NETWORK_LOST\n"]
            return [b"GSM_READY\n", b"NETWORK_OK\n"]

    def master_fd(self) -> Optional[int]:
        with self._lock:
            return self._master_fd


def _is_disconnected(error: OSError) -> bool:
    return error.errno == errno.EIO


def _write_frames(master_fd: int, frames: list[bytes]) -> bool:
    try:
        for frame in frames:
            remaining = memoryview(frame)
            while remaining:
                written = os.write(master_fd, remaining)
                remaining = remaining[written:]
    except OSError as error:
        if _is_disconnected(error):
            return False
        raise
    return True


def _announce_readiness(modem: VirtualModem, master_fd: int) -> bool:
    time.sleep(ATTACH_SETTLE_SECONDS)
    return _write_frames(master_fd, modem.readiness_frames())


PHONE_UI = """<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SAPOT Virtual Phone</title><style>
*{box-sizing:border-box}body{margin:0;background:#e8edf3;font:15px system-ui,sans-serif;color:#142033}main{max-width:760px;margin:24px auto;background:#fff;min-height:90vh;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px #0002}header,.controls,form{padding:14px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}header{background:#18283d;color:#fff}h1{font-size:18px;margin:0}.controls{border-bottom:1px solid #dbe2ea}input,select,button{font:inherit;padding:8px;border:1px solid #b9c4d0;border-radius:8px}button{background:#1769aa;color:#fff;border:0;cursor:pointer}.state{margin-left:auto;font-size:13px}.messages{min-height:460px;padding:18px;background:#f7f9fb;display:flex;flex-direction:column;gap:9px}.message{max-width:78%;padding:10px 12px;border-radius:12px}.received{align-self:flex-start;background:#e3edf9}.sent{align-self:flex-end;background:#d7f5df}.meta{font-size:11px;color:#526173;margin-top:4px}form{border-top:1px solid #dbe2ea}form input{flex:1;min-width:250px}.notice{padding:0 18px 12px;color:#a33;font-size:13px}</style><main><header><h1>SAPOT Virtual Phone</h1><span class=\"state\" id=\"state\"></span></header><div class=\"controls\"><input id=\"phone\" value=\"+639171234567\" aria-label=\"Phone number\"><button id=\"open\">Open inbox</button><label>SIM <select id=\"sim\"><option value=\"true\">Present</option><option value=\"false\">Missing</option></select></label><label>Network <select id=\"network\"><option value=\"true\">Connected</option><option value=\"false\">Lost</option></select></label><label>Outbound <select id=\"mode\"><option>success</option><option>NO_PROMPT</option><option>TIMEOUT</option></select></label></div><div class=\"messages\" id=\"messages\"></div><div class=\"notice\" id=\"notice\"></div><form id=\"reply\"><input id=\"body\" maxlength=\"127\" placeholder=\"Reply as this phone\" required><button>Send reply</button></form></main><script>
const $=id=>document.getElementById(id);let phone=$('phone').value;async function json(url,o){const r=await fetch(url,o);const d=await r.json();if(!r.ok)throw Error(d.detail||'Request failed');return d}function esc(s){const e=document.createElement('span');e.textContent=s;return e.innerHTML}async function refresh(){try{const [m,s]=await Promise.all([json('/api/messages?phone='+encodeURIComponent(phone)),json('/api/modem')]);$('messages').innerHTML=m.messages.map(x=>`<div class=\"message ${x.direction}\"><div>${esc(x.body)}</div><div class=\"meta\">${x.direction==='received'?'SAPOT Gateway':'You'} · ${new Date(x.timestamp).toLocaleTimeString()} · ${x.status}</div></div>`).join('');$('state').textContent=s.gsm_ready?'Ready':'Unavailable';$('sim').value=String(s.sim_present);$('network').value=String(s.network_connected);$('mode').value=s.outbound_result_mode;$('reply').querySelector('button').disabled=!s.gsm_ready;$('notice').textContent=s.gsm_ready?'':(!s.sim_present?'Replies are disabled because the SIM is missing.':'Replies are disabled because the network is unavailable.')}catch(e){$('notice').textContent=e.message}}$('open').onclick=()=>{phone=$('phone').value;refresh()};$('reply').onsubmit=async e=>{e.preventDefault();try{await json('/api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone_number:phone,body:$('body').value})});$('body').value='';refresh()}catch(e){$('notice').textContent=e.message}};['sim','network','mode'].forEach(id=>$(id).onchange=async()=>{try{await json('/api/modem',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sim_present:$('sim').value==='true',network_connected:$('network').value==='true',outbound_result_mode:$('mode').value})});refresh()}catch(e){$('notice').textContent=e.message}});refresh();setInterval(refresh,1500);</script>"""


def make_http_handler(modem: VirtualModem):
    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, status: int, value: Any) -> None:
            data = json.dumps(value).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _payload(self) -> Optional[dict[str, Any]]:
            try:
                length = int(self.headers.get("Content-Length", "0"))
                value = json.loads(self.rfile.read(length).decode("utf-8"))
                return value if isinstance(value, dict) else None
            except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
                return None

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/":
                data = PHONE_UI.encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            elif parsed.path == "/api/messages":
                number = parse_qs(parsed.query).get("phone", [None])[0]
                if not valid_phone_number(number):
                    self._send_json(HTTPStatus.BAD_REQUEST, {"detail": "phone must be E.164 format"})
                else:
                    self._send_json(HTTPStatus.OK, {"phone_number": number, "messages": modem.messages(number)})
            elif parsed.path == "/api/modem":
                self._send_json(HTTPStatus.OK, modem.status())
            else:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})

        def do_POST(self) -> None:
            if self.path == "/api/messages":
                payload = self._payload()
                if payload is None:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"detail": "body must be a JSON object"})
                    return
                message, error = modem.inject_inbound(payload.get("phone_number"), payload.get("body"))
                self._send_json(HTTPStatus.CREATED if message else HTTPStatus.SERVICE_UNAVAILABLE if error in {"SIM_MISSING", "NETWORK_LOST", "MODEM_DISCONNECTED"} else HTTPStatus.BAD_REQUEST, {"message": message} if message else {"detail": error})
            elif self.path == "/api/reset":
                modem.reset()
                self._send_json(HTTPStatus.OK, {"ok": True})
            else:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})

        def do_PUT(self) -> None:
            if self.path != "/api/modem":
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})
                return
            payload = self._payload()
            if payload is None:
                self._send_json(HTTPStatus.BAD_REQUEST, {"detail": "body must be a JSON object"})
                return
            status, error, frames = modem.update(payload)
            if error:
                self._send_json(HTTPStatus.BAD_REQUEST, {"detail": error})
                return
            fd = modem.master_fd()
            if fd is not None and frames and not _write_frames(fd, frames):
                modem.detach()
            self._send_json(HTTPStatus.OK, status)

        def log_message(self, _format: str, *_args: object) -> None:
            return
    return Handler


def start_http_server(modem: VirtualModem, host: str, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_http_handler(modem))
    threading.Thread(target=server.serve_forever, name="virtual-phone-http", daemon=True).start()
    return server


def run(port_file: Optional[str] = None, web_host: str = "127.0.0.1", web_port: int = 8002) -> None:
    if os.name != "posix":
        raise RuntimeError("mock_modem.py requires POSIX PTY support")
    modem = VirtualModem()
    http_server = start_http_server(modem, web_host, web_port)
    master_fd, slave_fd = pty.openpty()
    slave_path = os.ttyname(slave_fd)
    tty.setraw(slave_fd)
    os.close(slave_fd)
    if port_file:
        with open(port_file, "w", encoding="utf-8") as file:
            file.write(slave_path)
    print(f"Virtual modem port: {slave_path}", flush=True)
    print(f"Run the gateway with: SERIAL_PORT={slave_path} python main.py", flush=True)
    attached = False
    buffer = ""
    try:
        while True:
            if not attached:
                if _announce_readiness(modem, master_fd):
                    modem.attach(master_fd)
                    attached = True
                else:
                    time.sleep(DISCONNECTED_POLL_SECONDS)
                continue
            readable, _, _ = select.select([master_fd], [], [], DISCONNECTED_POLL_SECONDS)
            if not readable:
                continue
            try:
                chunk = os.read(master_fd, 4096)
            except OSError as error:
                if not _is_disconnected(error):
                    raise
                modem.detach(); attached = False; buffer = ""; continue
            if not chunk:
                modem.detach(); attached = False; buffer = ""; continue
            buffer += chunk.decode("utf-8", errors="replace")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                command = parse_send_sms(line.removesuffix("\r"))
                if command is None:
                    print(f"Ignored modem command: {line!r}", flush=True)
                    continue
                number, body = command
                print(f"SMS request to {number}: {body}", flush=True)
                delivered, reason = modem.receive_outbound(number, body)
                if reason == "TIMEOUT":
                    continue
                frame = f"SMS_SENT|{number}\n" if delivered else f"SMS_FAILED|{number}|{reason}\n"
                if not _write_frames(master_fd, [frame.encode()]):
                    modem.detach(); attached = False; buffer = ""; break
    finally:
        modem.detach()
        http_server.shutdown()
        http_server.server_close()
        os.close(master_fd)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port-file", help="write the generated PTY path here before accepting a serial client")
    parser.add_argument("--web-host", default="127.0.0.1", help="virtual-phone HTTP bind address")
    parser.add_argument("--web-port", type=int, default=8002, help="virtual-phone HTTP port")
    arguments = parser.parse_args()
    try:
        run(arguments.port_file, arguments.web_host, arguments.web_port)
    except KeyboardInterrupt:
        sys.exit(0)
