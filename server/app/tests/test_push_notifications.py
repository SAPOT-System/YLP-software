import types
import uuid
from unittest.mock import patch

from sqlmodel import Session, select

from app.db_operations import push_notifications
from app.models.admin_push_token import AdminPushToken


def _seed(session: Session, *tokens: str):
    # AdminPushToken.admin_user_id is a non-nullable FK (Task 2's model); the
    # value is irrelevant to send_admin_alert, so use a fresh UUID per row.
    for t in tokens:
        session.add(
            AdminPushToken(admin_user_id=uuid.uuid4(), token=t, platform="android")
        )
    session.commit()


def _resp(success: bool, exception=None):
    return types.SimpleNamespace(success=success, exception=exception, message_id="m")


def test_send_admin_alert_sends_title_body_and_url(session, monkeypatch):
    monkeypatch.setattr(push_notifications, "engine", session.get_bind())
    monkeypatch.setenv("ADMIN_WEB_URL", "https://admin.example/dashboard")
    _seed(session, "tok-1", "tok-2")

    batch = types.SimpleNamespace(responses=[_resp(True), _resp(True)])
    with patch.object(push_notifications.messaging, "send_each_for_multicast",
                      return_value=batch) as send:
        push_notifications.send_admin_alert("High CPU", "cpu at 92%")

    (msg,), _ = send.call_args
    assert msg.notification.title == "High CPU"
    assert msg.notification.body == "cpu at 92%"
    assert msg.data == {"url": "https://admin.example/dashboard"}
    assert set(msg.tokens) == {"tok-1", "tok-2"}


def test_send_admin_alert_deletes_unregistered_tokens(session, monkeypatch):
    monkeypatch.setattr(push_notifications, "engine", session.get_bind())
    monkeypatch.setenv("ADMIN_WEB_URL", "https://admin.example/dashboard")
    _seed(session, "good", "dead")

    from firebase_admin import messaging
    batch = types.SimpleNamespace(
        responses=[_resp(True), _resp(False, messaging.UnregisteredError("gone"))]
    )
    with patch.object(push_notifications.messaging, "send_each_for_multicast",
                      return_value=batch):
        push_notifications.send_admin_alert("t", "b")

    remaining = [r.token for r in session.exec(select(AdminPushToken)).all()]
    assert remaining == ["good"]


def test_send_admin_alert_no_tokens_is_noop(session, monkeypatch):
    monkeypatch.setattr(push_notifications, "engine", session.get_bind())
    with patch.object(push_notifications.messaging, "send_each_for_multicast") as send:
        push_notifications.send_admin_alert("t", "b")
    send.assert_not_called()


def test_send_admin_alert_swallows_send_errors(session, monkeypatch):
    monkeypatch.setattr(push_notifications, "engine", session.get_bind())
    monkeypatch.setenv("ADMIN_WEB_URL", "https://admin.example/dashboard")
    _seed(session, "tok-1")
    with patch.object(push_notifications.messaging, "send_each_for_multicast",
                      side_effect=RuntimeError("network down")):
        push_notifications.send_admin_alert("t", "b")  # must not raise
