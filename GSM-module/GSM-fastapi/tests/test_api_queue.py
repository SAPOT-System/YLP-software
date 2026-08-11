from fastapi.testclient import TestClient
import pytest

import api
from serial_worker import OutboundQueueFullError, WorkerStoppingError


@pytest.fixture(autouse=True)
def reset_worker():
    previous = api._worker
    yield
    api._worker = previous


class RejectingWorker:
    gsm_ready = True
    connected = True
    last_status = "ready"
    outbound_queue_depth = 1
    outbound_queue_capacity = 1
    outbound_in_flight = True

    def __init__(self, error):
        self.error = error

    def send_sms(self, *_args, **_kwargs):
        raise self.error


def test_queue_full_returns_nested_503_and_updates_log(monkeypatch):
    updates = []
    monkeypatch.setattr(api.database, "log_message", lambda **_kwargs: "message-id")
    monkeypatch.setattr(api.database, "update_message_status", lambda *args: updates.append(args))
    api._worker = RejectingWorker(OutboundQueueFullError())

    response = TestClient(api.app).post("/sms/send", json={
        "number": "+639171234567", "body": "message"
    })

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "message": "Outbound SMS queue is full",
        "reason": "QUEUE_FULL",
        "msg_id": "message-id",
    }
    assert updates == [("message-id", "failed", "QUEUE_FULL")]


def test_stopping_returns_nested_503_and_updates_log(monkeypatch):
    updates = []
    monkeypatch.setattr(api.database, "log_message", lambda **_kwargs: "message-id")
    monkeypatch.setattr(api.database, "update_message_status", lambda *args: updates.append(args))
    api._worker = RejectingWorker(WorkerStoppingError())

    response = TestClient(api.app).post("/sms/send", json={
        "number": "+639171234567", "body": "message"
    })

    assert response.status_code == 503
    assert response.json()["detail"]["reason"] == "SERVICE_STOPPING"
    assert updates == [("message-id", "failed", "SERVICE_STOPPING")]


def test_detailed_health_keeps_inbound_queue_depth_and_adds_outbound_fields(monkeypatch):
    class Worker(RejectingWorker):
        def __init__(self):
            self.incoming_queue = __import__("queue").Queue()
            self.incoming_queue.put(object())

    api._worker = Worker()
    monkeypatch.setattr(api.database, "get_messages", lambda **_kwargs: {"messages": [], "total": 0})

    response = TestClient(api.app).get("/health/detailed")

    assert response.status_code == 200
    assert response.json()["queue_depth"] == 1
    assert response.json()["outbound_queue_depth"] == 1
    assert response.json()["outbound_queue_capacity"] == 1
    assert response.json()["outbound_in_flight"] is True
