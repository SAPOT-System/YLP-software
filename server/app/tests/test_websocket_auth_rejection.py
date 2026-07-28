"""Regression tests for #315.

Root cause being guarded against: an invalid/expired token on the
signalling WebSocket (`/ws/`) closed the socket correctly, but then raised
a bare `Exception("Unauthorized")` that escaped the handler unhandled,
causing Starlette/uvicorn to log a full ERROR-level traceback for what is
an expected, routine rejection.

The fix: `authenticate_websocket` raises a dedicated `WebSocketAuthError`,
which `main_web_socket` catches and logs as a concise warning instead of
letting it propagate as an unhandled exception.
"""
import logging

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


def test_invalid_token_logs_concise_warning_not_error(client: TestClient, caplog):
    # Arrange
    caplog.set_level(logging.WARNING, logger="app.api.peer_connection")

    # Act
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/?token=not-a-real-token"):
            pass

    # Assert: a concise warning was logged, and nothing at ERROR level
    # (no unhandled-exception traceback) came out of this rejection.
    assert any(
        record.levelno == logging.WARNING and "auth rejected" in record.message
        for record in caplog.records
    )
    assert not any(record.levelno >= logging.ERROR for record in caplog.records)
