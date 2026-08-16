"""Regression tests for WebSocket DB-connection pool usage.

Root cause being guarded against: the WebSocket endpoint used a
request-scoped ``SessionDep`` dependency, whose ``with Session(engine)``
block stays open for the *entire* lifetime of the socket. Each connected
peer therefore pinned one pooled DB connection while idle, exhausting the
pool (size 10 + overflow 5 = 15) once >15 peers connected concurrently.
The expiry worker and activity-status updates then timed out.

The fix: open short-lived sessions per DB operation so an idle peer holds
zero connections.
"""
import asyncio
import logging
import time
from uuid import uuid4

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import QueuePool
from fastapi.testclient import TestClient

import app.api.peer_connection as peer_connection
from app.main import app
from app.db_operations.auth import get_session
from app.db_operations.token import create_access_token
from app.db_operations.connection_manager import ConnectionManager


class FailingWebSocket:
    async def send_json(self, message: dict) -> None:
        raise RuntimeError("connection closed")


def test_personal_delivery_failure_is_logged_and_disconnects(caplog):
    manager = ConnectionManager()
    user_id = uuid4()
    manager._local[user_id] = FailingWebSocket()
    caplog.set_level(logging.INFO, logger="app")

    asyncio.run(manager.send_personal_message(user_id, {"type": "ping"}))

    assert user_id not in manager._local
    record = next(record for record in caplog.records if "WebSocket delivery failed" in record.message)
    assert record.user_id == str(user_id)
    assert record.action == "websocket_user_disconnected"
    assert record.entity_id is None
    assert record.metadata_json == {}


def test_personal_delivery_failure_keeps_reconnected_socket():
    manager = ConnectionManager()
    user_id = uuid4()
    replacement = object()

    class ReconnectingWebSocket:
        async def send_json(self, message: dict) -> None:
            manager._local[user_id] = replacement
            raise RuntimeError("connection closed")

    manager._local[user_id] = ReconnectingWebSocket()

    asyncio.run(manager.send_personal_message(user_id, {"type": "ping"}))

    assert manager._local[user_id] is replacement


def test_broadcast_delivery_failure_keeps_reconnected_socket():
    manager = ConnectionManager()
    user_id = uuid4()
    replacement = object()

    class ReconnectingWebSocket:
        async def send_json(self, message: dict) -> None:
            manager._local[user_id] = replacement
            raise RuntimeError("connection closed")

    class OneMessagePubSub:
        async def listen(self):
            yield {"type": "message", "data": '{"_wid": "other", "msg": {"type": "ping"}}'}

        async def unsubscribe(self, channel: str) -> None:
            return None

        async def aclose(self) -> None:
            return None

    manager._local[user_id] = ReconnectingWebSocket()

    asyncio.run(manager._broadcast_loop(OneMessagePubSub()))

    assert manager._local[user_id] is replacement


@pytest.fixture(name="pool_engine")
def pool_engine_fixture(tmp_path, monkeypatch):
    """A real QueuePool-backed SQLite engine so we can inspect checked-out
    connections, wired into every place the WS handler reaches the DB."""
    db_path = tmp_path / "pool_test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=0,
        pool_timeout=2,
    )
    SQLModel.metadata.create_all(engine)

    # SessionDep -> get_session must use the test engine.
    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    # _set_status_bg and the connect-time drain reach the module-level engine.
    monkeypatch.setattr(peer_connection, "engine", engine)

    yield engine

    app.dependency_overrides.clear()
    engine.dispose()


def _wait_for_checkedout_zero(engine, timeout: float = 3.0) -> int:
    """Poll until no connections are checked out (transient background work
    releases quickly); returns the final count."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if engine.pool.checkedout() == 0:
            return 0
        time.sleep(0.05)
    return engine.pool.checkedout()


def test_idle_websocket_holds_no_pool_connection(pool_engine):
    # Arrange
    client = TestClient(app)
    token = create_access_token({"sub": "550e8400-e29b-41d4-a716-446655440000"})

    # Act: connect and reach the idle receive loop (ping/pong proves the
    # connect-time drain has completed and the handler is waiting).
    with client.websocket_connect(f"/ws/?token={token}") as ws:
        # The handler broadcasts an "online" status-update to all peers
        # (including the connecting one) on connect — drain it first.
        first = ws.receive_json()
        assert first["type"] == "status-update"

        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}

        # Assert: an idle peer must not pin a pooled connection.
        remaining = _wait_for_checkedout_zero(pool_engine)
        assert remaining == 0, (
            f"idle websocket pinned {remaining} pooled connection(s); "
            "session is bound to socket lifetime instead of per-operation"
        )
