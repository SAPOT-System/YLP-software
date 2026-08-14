"""Regression tests for #315 and #326.

Root cause being guarded against (#315): an invalid/expired token on the
signalling WebSocket (`/ws/`) closed the socket correctly, but then raised
a bare `Exception("Unauthorized")` that escaped the handler unhandled,
causing Starlette/uvicorn to log a full ERROR-level traceback for what is
an expected, routine rejection.

The fix: `authenticate_websocket` raises a dedicated `WebSocketAuthError`,
which each route catches instead of letting it propagate as an unhandled
exception. Invalid tokens are expected client input, so the rejection stays
silent after the socket is closed.

#326 found the same unhandled-exception gap on the GPS WebSocket routes
(`/gps/ws/{user_id}` and `/gps/ws/monitor/rescuers/{rescuer_id}`), which
call `authenticate_websocket` without catching `WebSocketAuthError` at
all, and it flagged that uvicorn's own access log still emits a `403`
line for every rejection. That line is also suppressed so routine invalid
tokens do not create log noise.
"""
import logging
import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def test_invalid_token_rejects_cleanly_without_unhandled_exception(client: TestClient):
    # Arrange / Act / Assert: an invalid token must close the socket (1008)
    # without the raw auth exception escaping the ASGI app unhandled.
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/?token=not-a-real-token"):
            pass

    assert exc_info.value.code == 1008


def test_invalid_token_rejection_is_silent(client: TestClient, caplog):
    caplog.set_level(logging.WARNING, logger="app.api.peer_connection")

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/?token=not-a-real-token"):
            pass

    assert not any(
        record.name == "app.api.peer_connection" for record in caplog.records
    )


def test_gps_stream_invalid_token_rejects_cleanly_without_unhandled_exception(client: TestClient):
    # Arrange
    user_id = str(uuid.uuid4())

    # Act / Assert: an invalid token on the GPS stream socket must close
    # cleanly (1008) rather than letting WebSocketAuthError escape unhandled.
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/gps/ws/{user_id}?token=not-a-real-token"):
            pass

    assert exc_info.value.code == 1008


def test_gps_stream_invalid_token_rejection_is_silent(client: TestClient, caplog):
    user_id = str(uuid.uuid4())
    caplog.set_level(logging.WARNING, logger="app.api.gps")

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/gps/ws/{user_id}?token=not-a-real-token"):
            pass

    assert not any(record.name == "app.api.gps" for record in caplog.records)


def test_gps_monitor_invalid_token_rejects_cleanly_without_unhandled_exception(client: TestClient):
    # Arrange
    rescuer_id = str(uuid.uuid4())

    # Act / Assert
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/gps/ws/monitor/rescuers/{rescuer_id}?token=not-a-real-token"):
            pass

    assert exc_info.value.code == 1008


def test_gps_monitor_invalid_token_rejection_is_silent(client: TestClient, caplog):
    rescuer_id = str(uuid.uuid4())
    caplog.set_level(logging.WARNING, logger="app.api.gps")

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/gps/ws/monitor/rescuers/{rescuer_id}?token=not-a-real-token"):
            pass

    assert not any(record.name == "app.api.gps" for record in caplog.records)


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
        args=(("127.0.0.1", 54321), "/ws/?token=not-a-real-token"),
        exc_info=None,
    )


def test_uvicorn_ws_403_filter_suppresses_rejection_line():
    """The filter keeps uvicorn's handshake rejection line silent."""
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
