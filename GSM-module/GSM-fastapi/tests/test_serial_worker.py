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
