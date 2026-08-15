import asyncio
import threading

from fastapi.testclient import TestClient
import httpx
import pytest

import api
from config import settings
from serial_worker import (
    MAX_SEND_QUEUE_SIZE,
    OutboundQueueFullError,
    WorkerStoppingError,
)

AUTH_HEADERS = {"X-GSM-Secret": settings.gsm_secret}


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

    response = TestClient(api.app).post(
        "/sms/send",
        json={"number": "+639171234567", "body": "message"},
        headers=AUTH_HEADERS,
    )

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

    response = TestClient(api.app).post(
        "/sms/send",
        json={"number": "+639171234567", "body": "message"},
        headers=AUTH_HEADERS,
    )

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


def test_maximum_capacity_still_rejects_and_serves_health(monkeypatch):
    class SaturatingWorker:
        gsm_ready = True
        connected = True
        last_status = "ready"

        def __init__(self, capacity):
            self.capacity = capacity
            self.admitted = 0
            self.lock = threading.Lock()
            self.release = threading.Event()

        def send_sms(self, *_args, **_kwargs):
            with self.lock:
                if self.admitted >= self.capacity:
                    raise OutboundQueueFullError()
                self.admitted += 1
            self.release.wait(timeout=5)
            return {"ok": True, "reason": None}

    worker = SaturatingWorker(capacity=MAX_SEND_QUEUE_SIZE + 1)
    api._worker = worker
    monkeypatch.setattr(api.database, "log_message", lambda **_kwargs: "message-id")
    monkeypatch.setattr(api.database, "update_message_status", lambda *_args: None)

    async def exercise_saturation():
        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"number": "+639171234567", "body": "message"}
            admitted = [asyncio.create_task(client.post(
                "/sms/send", json=payload, headers=AUTH_HEADERS
            ))
                        for _ in range(worker.capacity)]

            for _ in range(100):
                with worker.lock:
                    if worker.admitted == worker.capacity:
                        break
                await asyncio.sleep(0.01)

            rejected = await asyncio.wait_for(
                client.post("/sms/send", json=payload, headers=AUTH_HEADERS),
                timeout=1,
            )
            health = await asyncio.wait_for(client.get("/health"), timeout=1)
            worker.release.set()
            completed = await asyncio.gather(*admitted)

        return rejected, health, completed

    rejected, health, completed = asyncio.run(exercise_saturation())

    assert rejected.status_code == 503
    assert rejected.json()["detail"]["reason"] == "QUEUE_FULL"
    assert health.status_code == 200
    assert all(response.status_code == 200 for response in completed)


@pytest.mark.parametrize("headers", [{}, {"X-GSM-Secret": "wrong-secret"}])
def test_send_rejects_missing_or_invalid_secret_before_side_effects(
    monkeypatch, headers
):
    calls = []
    monkeypatch.setattr(
        api.database, "log_message", lambda **_kwargs: calls.append("logged")
    )
    api._worker = RejectingWorker(AssertionError("worker must not be called"))

    response = TestClient(api.app).post(
        "/sms/send",
        json={"number": "+639171234567", "body": "message"},
        headers=headers,
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid GSM secret"}
    assert calls == []
