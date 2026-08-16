import threading
import time

import pytest

from serial_worker import (
    OutboundQueueFullError,
    SerialWorker,
    WorkerStoppingError,
    _SendRequest,
)


def ready_worker(capacity=1):
    worker = SerialWorker("fake", send_queue_maxsize=capacity)
    worker.connected = True
    worker.gsm_ready = True
    return worker


def test_capacity_rejects_without_serial_write():
    worker = ready_worker()
    worker._send_queue.put(_SendRequest("+639171234567", "first", 1))

    with pytest.raises(OutboundQueueFullError):
        worker.send_sms("+639171234568", "second", timeout=0)

    assert worker.outbound_queue_depth == 1
    assert worker.outbound_in_flight is False


def test_capacity_excludes_registered_in_flight_request():
    worker = ready_worker()
    in_flight = _SendRequest("+639171234567", "first", 1)
    with worker._in_flight_lock:
        worker._in_flight = in_flight

    worker._send_queue.put_nowait(_SendRequest("+639171234568", "second", 1))

    assert worker.outbound_in_flight is True
    assert worker.outbound_queue_depth == 1
    assert worker.outbound_queue_capacity == 1


def test_inbound_queue_drops_excess_messages_without_blocking_reader():
    worker = SerialWorker("fake", incoming_queue_maxsize=1)

    worker._handle_line("SMS_RECEIVED|+639171234567|first")
    worker._handle_line("SMS_RECEIVED|+639171234568|second")

    assert worker.incoming_queue.qsize() == 1
    assert worker.incoming_queue_dropped == 1


def test_stop_drains_waiting_requests_without_sentinel():
    worker = ready_worker()
    request = _SendRequest("+639171234567", "queued", 1)
    worker._send_queue.put_nowait(request)

    class JoinedThread:
        def join(self, timeout):
            assert timeout == 5

    worker._reader_thread = JoinedThread()
    worker._sender_thread = JoinedThread()

    worker.stop()

    assert request.done.is_set()
    assert request.reason == "SERVICE_STOPPING"
    assert worker.outbound_queue_depth == 0


def test_stop_fails_active_request():
    worker = ready_worker()
    request = _SendRequest("+639171234567", "active", 1)
    with worker._active_lock:
        worker._active_request = request

    class JoinedThread:
        def join(self, timeout):
            assert timeout == 5

    worker._reader_thread = JoinedThread()
    worker._sender_thread = JoinedThread()

    worker.stop()

    assert request.done.is_set()
    assert request.reason == "SERVICE_STOPPING"
    assert worker.outbound_in_flight is False


def test_admission_rejects_after_shutdown_cutoff():
    worker = ready_worker()
    with worker._lifecycle_lock:
        worker._accepting = False

    with pytest.raises(WorkerStoppingError):
        worker.send_sms("+639171234567", "message", timeout=0)


def test_in_flight_completion_is_exact_once():
    worker = ready_worker()
    request = _SendRequest("+639171234567", "message", 1)
    with worker._in_flight_lock:
        worker._in_flight = request

    assert worker._complete_in_flight(request, True, None) is True
    assert worker._complete_in_flight(request, False, "TIMEOUT") is False
    assert request.success is True
    assert request.reason is None


def test_failure_before_write_prevents_late_serial_send():
    writes = []

    class FakeSerial:
        is_open = True

        def write(self, payload):
            writes.append(payload)

    worker = ready_worker()
    worker.gsm_ready = False
    worker._ser = FakeSerial()
    request = _SendRequest("+639171234567", "message", 1)
    worker._send_queue.put_nowait(request)
    sender = threading.Thread(target=worker._sender_loop)
    sender.start()

    for _ in range(100):
        with worker._active_lock:
            if worker._active_request is request:
                break
        time.sleep(0.01)

    worker._fail_active_request("NETWORK_LOST")
    worker.gsm_ready = True
    time.sleep(0.1)
    worker._stop.set()
    sender.join(timeout=2)

    assert request.done.is_set()
    assert request.reason == "NETWORK_LOST"
    assert writes == []


def test_queued_request_timed_out_by_caller_is_never_written():
    writes = []

    class FakeSerial:
        is_open = True

        def write(self, payload):
            writes.append(payload)

    worker = ready_worker(capacity=2)
    worker._ser = FakeSerial()
    first = _SendRequest("+639171234567", "first", 10)
    worker._send_queue.put_nowait(first)
    sender = threading.Thread(target=worker._sender_loop)
    sender.start()

    for _ in range(100):
        if writes:
            break
        time.sleep(0.01)

    result = worker.send_sms("+639171234568", "second", timeout=0.01)
    worker._complete_in_flight(first, True, None)

    for _ in range(100):
        if worker.outbound_queue_depth == 0:
            break
        time.sleep(0.01)
    worker._stop.set()
    sender.join(timeout=2)

    assert result == {"ok": False, "reason": "CLIENT_TIMEOUT"}
    assert writes == [b"SEND_SMS|+639171234567|first\n"]
    assert sender.is_alive() is False


def test_stop_does_not_overwrite_completed_queue_timeout():
    worker = ready_worker()

    result = worker.send_sms("+639171234568", "message", timeout=0.01)
    request = worker._send_queue.get_nowait()
    worker._send_queue.put_nowait(request)

    class JoinedThread:
        def join(self, timeout):
            assert timeout == 5

    worker._reader_thread = JoinedThread()
    worker._sender_thread = JoinedThread()
    worker.stop()

    assert result == {"ok": False, "reason": "CLIENT_TIMEOUT"}
    assert request.reason == "CLIENT_TIMEOUT"


def test_write_crossing_admission_deadline_waits_for_confirmation():
    writes = []
    write_started = threading.Event()
    release_write = threading.Event()

    class BlockingSerial:
        is_open = True

        def write(self, payload):
            write_started.set()
            release_write.wait(timeout=1)
            writes.append(payload)

    worker = ready_worker()
    worker._ser = BlockingSerial()
    sender = threading.Thread(target=worker._sender_loop)
    sender.start()
    result = {}

    def send():
        result.update(
            worker.send_sms("+639171234568", "message", timeout=0.05)
        )

    caller = threading.Thread(target=send)
    caller.start()
    assert write_started.wait(timeout=1)
    time.sleep(0.06)
    release_write.set()
    worker._resolve_in_flight("+639171234568", True, None)
    caller.join(timeout=1)
    worker._stop.set()
    sender.join(timeout=2)

    assert result == {"ok": True, "reason": None}
    assert writes == [b"SEND_SMS|+639171234568|message\n"]
    assert caller.is_alive() is False
    assert sender.is_alive() is False


def test_stale_confirmation_cannot_complete_request_before_write():
    writes = []

    class FakeSerial:
        is_open = True

        def write(self, payload):
            writes.append(payload)

    worker = ready_worker()
    worker.gsm_ready = False
    worker._ser = FakeSerial()
    request = _SendRequest("+639171234568", "message", 1)
    worker._send_queue.put_nowait(request)
    sender = threading.Thread(target=worker._sender_loop)
    sender.start()

    for _ in range(100):
        with worker._active_lock:
            if worker._active_request is request:
                break
        time.sleep(0.01)

    worker._resolve_in_flight("+639171234567", True, None)
    assert request.done.is_set() is False

    worker.gsm_ready = True
    for _ in range(100):
        if writes:
            break
        time.sleep(0.01)
    worker._resolve_in_flight(request.number, True, None)
    worker._stop.set()
    sender.join(timeout=2)

    assert writes == [b"SEND_SMS|+639171234568|message\n"]
    assert request.success is True
    assert sender.is_alive() is False


@pytest.mark.parametrize("capacity", [0, 21])
def test_constructor_rejects_capacity_outside_threadpool_safe_range(capacity):
    with pytest.raises(ValueError, match="between 1 and 20"):
        SerialWorker("fake", send_queue_maxsize=capacity)


def test_serial_connection_uses_finite_write_timeout(monkeypatch):
    captured = {}

    class FakeSerial:
        is_open = True
        in_waiting = 0

        def __init__(self, *args, **kwargs):
            captured.update(kwargs)

        def read(self, _):
            worker._stop.set()
            return b""

        def close(self):
            pass

    worker = SerialWorker("fake")
    monkeypatch.setattr("serial_worker.serial.Serial", FakeSerial)
    worker._connect_and_read()

    assert captured["write_timeout"] == 5.0
