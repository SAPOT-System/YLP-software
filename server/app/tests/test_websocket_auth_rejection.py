"""Regression tests for #315 and #326.

Root cause being guarded against (#315): an invalid/expired token on the
signalling WebSocket (`/ws/`) closed the socket correctly, but then raised
a bare `Exception("Unauthorized")` that escaped the handler unhandled,
causing Starlette/uvicorn to log a full ERROR-level traceback for what is
an expected, routine rejection.

The fix: `authenticate_websocket` raises a dedicated `WebSocketAuthError`,
which `main_web_socket` catches and logs as a concise warning instead of
letting it propagate as an unhandled exception.

#326 found the same unhandled-exception gap on the GPS WebSocket routes
(`/gps/ws/{user_id}` and `/gps/ws/monitor/rescuers/{rescuer_id}`), which
call `authenticate_websocket` without catching `WebSocketAuthError` at
all, and it flagged that uvicorn's own access log still emits a `403`
line for every rejection (duplicating the app-level warning at a second
severity) — see `test_websocket_403_access_log_is_suppressed`.
"""
import logging
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import app.api.peer_connection as peer_connection
from app.db_operations.connection_manager import manager
from app.db_operations.token import create_access_token
from app.db_operations.websocket_auth import WEBSOCKET_AUTH_PROTOCOL


def _protocols(token: str) -> list[str]:
    return [WEBSOCKET_AUTH_PROTOCOL, token]


@pytest.fixture
def signaling_handshake_only(monkeypatch):
    async def connect(user_id, websocket):
        await websocket.accept(subprotocol=WEBSOCKET_AUTH_PROTOCOL)

    monkeypatch.setattr(manager, "connect", connect)
    monkeypatch.setattr(peer_connection, "get_queued_messages", lambda *args: [])
    monkeypatch.setattr(peer_connection, "_set_status_bg", lambda *args: None)


def test_invalid_token_rejects_cleanly_without_unhandled_exception(client: TestClient):
    # Arrange / Act / Assert: an invalid token must close the socket (1008)
    # without the raw auth exception escaping the ASGI app unhandled.
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/", subprotocols=_protocols("not-a-real-token")):
            pass

    assert exc_info.value.code == 1008


def test_invalid_token_logs_concise_warning_not_error(client: TestClient, caplog):
    # Arrange
    caplog.set_level(logging.WARNING, logger="app.api.peer_connection")

    # Act
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/", subprotocols=_protocols("not-a-real-token")):
            pass

    # Assert: a concise warning was logged, and nothing at ERROR level
    # (no unhandled-exception traceback) came out of this rejection.
    assert any(
        record.levelno == logging.WARNING and "auth rejected" in record.message
        for record in caplog.records
    )
    assert not any(record.levelno >= logging.ERROR for record in caplog.records)


def test_gps_stream_invalid_token_rejects_cleanly_without_unhandled_exception(client: TestClient):
    # Arrange
    user_id = str(uuid.uuid4())

    # Act / Assert: an invalid token on the GPS stream socket must close
    # cleanly (1008) rather than letting WebSocketAuthError escape unhandled.
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/gps/ws/{user_id}", subprotocols=_protocols("not-a-real-token")
        ):
            pass

    assert exc_info.value.code == 1008


def test_gps_stream_invalid_token_logs_concise_warning_not_error(client: TestClient, caplog):
    # Arrange
    user_id = str(uuid.uuid4())
    caplog.set_level(logging.WARNING, logger="app.api.gps")

    # Act
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/gps/ws/{user_id}", subprotocols=_protocols("not-a-real-token")
        ):
            pass

    # Assert
    assert any(
        record.levelno == logging.WARNING and "auth rejected" in record.message
        for record in caplog.records
    )
    assert not any(record.levelno >= logging.ERROR for record in caplog.records)


def test_gps_monitor_invalid_token_rejects_cleanly_without_unhandled_exception(client: TestClient):
    # Arrange
    rescuer_id = str(uuid.uuid4())

    # Act / Assert
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/gps/ws/monitor/rescuers/{rescuer_id}",
            subprotocols=_protocols("not-a-real-token"),
        ):
            pass

    assert exc_info.value.code == 1008


def test_gps_monitor_invalid_token_logs_concise_warning_not_error(client: TestClient, caplog):
    # Arrange
    rescuer_id = str(uuid.uuid4())
    caplog.set_level(logging.WARNING, logger="app.api.gps")

    # Act
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/gps/ws/monitor/rescuers/{rescuer_id}",
            subprotocols=_protocols("not-a-real-token"),
        ):
            pass

    # Assert
    assert any(
        record.levelno == logging.WARNING and "auth rejected" in record.message
        for record in caplog.records
    )
    assert not any(record.levelno >= logging.ERROR for record in caplog.records)


def _make_ws_403_record() -> logging.LogRecord:
    """Build a record shaped like uvicorn's own websocket-rejection log
    line (see uvicorn/protocols/websockets/websockets_sansio_impl.py:
    `'%s - "WebSocket %s" 403'`, logger "uvicorn.error", level INFO).
    """
    return logging.LogRecord(
        name="uvicorn.error",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "WebSocket %s" 403',
        args=(("127.0.0.1", 54321), "/ws/"),
        exc_info=None,
    )


def test_uvicorn_ws_403_filter_downgrades_duplicate_rejection_line():
    """uvicorn logs its own `"WebSocket ..." 403` line (INFO, logger
    "uvicorn.error") for every handshake rejected before accept — the same
    event our app-level warning already reports at WARNING with more
    context. The filter installed in `app.main` must suppress that
    specific line from propagating at INFO so it doesn't double up the
    rejection at two severities.
    """
    from app.main import UvicornWebSocket403Filter

    filt = UvicornWebSocket403Filter()
    record = _make_ws_403_record()

    assert filt.filter(record) is False


def test_uvicorn_ws_403_filter_leaves_other_uvicorn_error_records_alone():
    # Arrange: an unrelated uvicorn.error record (e.g. a genuine 500) must
    # not be touched by the 403-specific filter.
    from app.main import UvicornWebSocket403Filter

    filt = UvicornWebSocket403Filter()
    record = logging.LogRecord(
        name="uvicorn.error",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="Exception in ASGI application",
        args=(),
        exc_info=None,
    )

    assert filt.filter(record) is True


@pytest.mark.parametrize(
    "protocols",
    [
        [],
        [WEBSOCKET_AUTH_PROTOCOL],
        ["not-sapot.jwt", "token"],
        [WEBSOCKET_AUTH_PROTOCOL, "token", "extra"],
        ["token", WEBSOCKET_AUTH_PROTOCOL],
    ],
)
def test_missing_or_ambiguous_protocols_close_with_1008(
    client: TestClient, protocols: list[str]
):
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/", subprotocols=protocols):
            pass

    assert exc_info.value.code == 1008


def test_expired_subprotocol_token_closes_with_1008(client: TestClient):
    token = create_access_token(
        {"sub": str(uuid.uuid4())}, expires_delta=timedelta(seconds=-1)
    )

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/", subprotocols=_protocols(token)):
            pass

    assert exc_info.value.code == 1008


def test_signed_token_without_subject_closes_with_1008(client: TestClient):
    token = create_access_token({})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/", subprotocols=_protocols(token)):
            pass

    assert exc_info.value.code == 1008


def test_query_only_token_closes_with_1008(client: TestClient):
    token = create_access_token({"sub": str(uuid.uuid4())})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/ws/?token={token}"):
            pass

    assert exc_info.value.code == 1008


def test_query_token_with_valid_subprotocol_auth_closes_with_1008(client: TestClient):
    token = create_access_token({"sub": str(uuid.uuid4())})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/ws/?token={token}", subprotocols=_protocols(token)
        ):
            pass

    assert exc_info.value.code == 1008


def test_valid_subprotocol_is_selected_and_target_id_remains_supported(
    client: TestClient, signaling_handshake_only
):
    token = create_access_token({"sub": str(uuid.uuid4())})
    target_id = uuid.uuid4()

    with client.websocket_connect(
        f"/ws/?target_id={target_id}", subprotocols=_protocols(token)
    ) as websocket:
        assert websocket.accepted_subprotocol == WEBSOCKET_AUTH_PROTOCOL
        assert websocket.scope["query_string"] == f"target_id={target_id}".encode()


def test_obsolete_websocket_html_test_route_is_not_reachable(client: TestClient):
    response = client.get(
        f"/ws/?target_id={uuid.uuid4()}&my_id={uuid.uuid4()}"
    )

    assert response.status_code == 404
