from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import api
import sms_handler


@pytest.mark.parametrize(
    ("sender", "expected_reason"),
    [
        ({"banned": True, "phone_is_verified": True}, "BANNED_SENDER"),
        ({"banned": False, "phone_is_verified": False}, "UNVERIFIED_SENDER"),
    ],
)
def test_handle_incoming_sms_reports_sender_rejection_reason(
    monkeypatch, sender, expected_reason
):
    monkeypatch.setattr(
        sms_handler.database, "get_user_by_phone", lambda _number: sender
    )

    reply, forward_number, forward_body, rejection_reason = (
        sms_handler.handle_incoming_sms("+639171234567", "help")
    )

    assert reply
    assert forward_number is None
    assert forward_body is None
    assert rejection_reason == expected_reason


def test_first_unregistered_message_sends_registration_warning(monkeypatch):
    monkeypatch.setattr(sms_handler.database, "get_user_by_phone", lambda _number: None)
    monkeypatch.setattr(
        sms_handler.database, "has_unregistered_warning", lambda _number: False
    )

    reply, forward_number, forward_body, rejection_reason = (
        sms_handler.handle_incoming_sms("+639171234567", "help")
    )

    assert reply == sms_handler.MSG_NO_ACCOUNT
    assert forward_number is None
    assert forward_body is None
    assert rejection_reason == "NO_ACCOUNT"


def test_later_unregistered_messages_are_ignored(monkeypatch):
    monkeypatch.setattr(sms_handler.database, "get_user_by_phone", lambda _number: None)
    monkeypatch.setattr(
        sms_handler.database,
        "has_unregistered_warning",
        lambda _number: True,
    )

    reply, forward_number, forward_body, rejection_reason = (
        sms_handler.handle_incoming_sms("+639171234567", "help again")
    )

    assert reply is None
    assert forward_number is None
    assert forward_body is None
    assert rejection_reason == "NO_ACCOUNT"


@pytest.mark.parametrize("reply_sent", [True, False])
def test_process_incoming_marks_warning_only_after_successful_reply(
    monkeypatch, reply_sent
):
    marked_numbers = []
    monkeypatch.setattr(api.database, "log_message", lambda **_kwargs: "message-id")
    monkeypatch.setattr(api.database, "update_message_status", lambda *_args: None)
    monkeypatch.setattr(
        api,
        "handle_incoming_sms",
        lambda _number, _body: (sms_handler.MSG_NO_ACCOUNT, None, None, "NO_ACCOUNT"),
    )
    monkeypatch.setattr(api, "_worker", object())
    monkeypatch.setattr(api, "_send_and_log", lambda **_kwargs: reply_sent)
    monkeypatch.setattr(
        api.database,
        "mark_unregistered_warning",
        lambda number: marked_numbers.append(number),
    )
    monkeypatch.setattr(api.database, "allow_inbound_response", lambda *args: True)

    api._process_incoming(SimpleNamespace(number="+639171234567", body="help"))

    expected = ["+639171234567"] if reply_sent else []
    assert marked_numbers == expected


def test_process_incoming_persists_rejection_reason(monkeypatch):
    updates = []
    monkeypatch.setattr(api.database, "log_message", lambda **_kwargs: "message-id")
    monkeypatch.setattr(
        api.database,
        "update_message_status",
        lambda *args: updates.append(args),
    )
    monkeypatch.setattr(
        api,
        "handle_incoming_sms",
        lambda _number, _body: (None, None, None, "BANNED_SENDER"),
    )

    api._process_incoming(
        SimpleNamespace(number="+639171234567", body="blocked message")
    )

    assert updates == [("message-id", "rejected", "BANNED_SENDER")]


import database as _db


def _init_test_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    _db.Base.metadata.create_all(engine)
    _db._Session = sessionmaker(bind=engine, expire_on_commit=False)
    _db._engine = engine


def test_grant_and_check_outbound_permission():
    _init_test_db()
    sapot = "+639171111111"
    external = "+639288888888"
    assert _db.has_outbound_permission(sapot, external) is False
    _db.grant_outbound_permission(sapot, external)
    assert _db.has_outbound_permission(sapot, external) is True


def test_grant_is_idempotent():
    _init_test_db()
    sapot = "+639171111111"
    external = "+639288888888"
    _db.grant_outbound_permission(sapot, external)
    _db.grant_outbound_permission(sapot, external)  # must not raise
    assert _db.has_outbound_permission(sapot, external) is True


def test_get_permitted_contacts_returns_correct_set():
    _init_test_db()
    external = "+639288888888"
    _db.grant_outbound_permission("+639171111111", external)
    _db.grant_outbound_permission("+639172222222", external)
    contacts = _db.get_permitted_contacts(external)
    assert set(contacts) == {"+639171111111", "+639172222222"}


def test_get_permitted_contacts_empty_when_none():
    _init_test_db()
    contacts = _db.get_permitted_contacts("+639299999999")
    assert contacts == []




def test_grant_permission_endpoint_stores_permission(monkeypatch):
    granted = []
    monkeypatch.setattr(
        "database.grant_outbound_permission",
        lambda sapot, external: granted.append((sapot, external))
    )
    from api import app as gsm_app
    client = TestClient(gsm_app)

    resp = client.post(
        "/grant-permission",
        json={"sapot_phone": "+639171111111", "external_phone": "+639288888888"},
        headers={"X-GSM-Secret": "test-gsm-secret"},
    )

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert granted == [("+639171111111", "+639288888888")]


def test_grant_permission_endpoint_rejects_wrong_secret(monkeypatch):
    from api import app as gsm_app
    client = TestClient(gsm_app)

    resp = client.post(
        "/grant-permission",
        json={"sapot_phone": "+639171111111", "external_phone": "+639288888888"},
        headers={"X-GSM-Secret": "wrong-secret"},
    )

    assert resp.status_code == 401


REGISTERED_USER = {
    "id": "abc123",
    "phone": "+639172222222",
    "username": "maria",
    "first_name": "Maria",
    "last_name": "Santos",
    "email": "m@s.com",
    "app_active": True,
}
SENDER_VERIFIED = {"banned": False, "phone_is_verified": True}


def test_new_session_with_no_permitted_contacts_is_rejected(monkeypatch):
    """An external number with zero outbound permissions must get NOT_PERMITTED."""
    monkeypatch.setattr(sms_handler.database, "get_user_by_phone", lambda _: SENDER_VERIFIED)
    monkeypatch.setattr(sms_handler.database, "lookup_number", lambda p: REGISTERED_USER if p in ("+639172222222", "+639171234567") else None)
    monkeypatch.setattr(sms_handler.database, "get_permitted_contacts", lambda _: [])
    monkeypatch.setattr(sms_handler.database, "get_session", lambda _: {"stage": "NEW", "target_phone": None, "target_username": None})
    monkeypatch.setattr(sms_handler.database, "update_session", lambda *_a, **_kw: None)
    monkeypatch.setattr(sms_handler.database, "has_unregistered_warning", lambda _: False)

    reply, fwd_num, fwd_body, reason = sms_handler.handle_incoming_sms(
        "+639171234567", "Hello"
    )

    assert reason == "NOT_PERMITTED"
    assert fwd_num is None


def test_new_session_with_exactly_one_permitted_contact_auto_routes(monkeypatch):
    """When there is exactly one permitted contact, the session goes ACTIVE immediately."""
    permitted = ["+639172222222"]
    monkeypatch.setattr(sms_handler.database, "get_user_by_phone", lambda _: SENDER_VERIFIED)
    monkeypatch.setattr(sms_handler.database, "lookup_number", lambda p: REGISTERED_USER if p in ("+639172222222", "+639171234567") else None)
    monkeypatch.setattr(sms_handler.database, "get_permitted_contacts", lambda _: permitted)
    session_updates = []
    monkeypatch.setattr(sms_handler.database, "get_session", lambda _: {"stage": "NEW", "target_phone": None, "target_username": None})
    monkeypatch.setattr(sms_handler.database, "update_session", lambda _phone, **kw: session_updates.append(kw))
    monkeypatch.setattr(sms_handler.database, "has_unregistered_warning", lambda _: False)

    reply, fwd_num, fwd_body, reason = sms_handler.handle_incoming_sms(
        "+639171234567", "Hello"
    )

    assert reason == "WELCOME"
    assert any(u.get("stage") == "ACTIVE" for u in session_updates)
    assert any(u.get("target_phone") == "+639172222222" for u in session_updates)


def test_set_target_blocked_when_not_in_permitted_set(monkeypatch):
    """[target] with a phone not in permitted contacts returns TARGET_NOT_PERMITTED."""
    permitted = ["+639172222222"]
    monkeypatch.setattr(sms_handler.database, "get_user_by_phone", lambda _: SENDER_VERIFIED)
    monkeypatch.setattr(sms_handler.database, "lookup_number", lambda p: REGISTERED_USER if p in ("+639171234567", "+639179999999") else None)
    monkeypatch.setattr(sms_handler.database, "get_permitted_contacts", lambda _: permitted)
    monkeypatch.setattr(sms_handler.database, "get_session", lambda _: {"stage": "AWAITING_TARGET", "target_phone": None, "target_username": None})
    monkeypatch.setattr(sms_handler.database, "update_session", lambda *_a, **_kw: None)
    monkeypatch.setattr(sms_handler.database, "has_unregistered_warning", lambda _: False)

    reply, fwd_num, fwd_body, reason = sms_handler.handle_incoming_sms(
        "+639171234567", "[target] +639179999999"
    )

    assert reason == "TARGET_NOT_PERMITTED"
    assert fwd_num is None


def test_set_target_allowed_when_in_permitted_set(monkeypatch):
    """[target] with a phone in the permitted set succeeds."""
    permitted = ["+639172222222"]
    monkeypatch.setattr(sms_handler.database, "get_user_by_phone", lambda _: SENDER_VERIFIED)
    monkeypatch.setattr(sms_handler.database, "lookup_number", lambda p: REGISTERED_USER if p in ("+639172222222", "+639171234567") else None)
    monkeypatch.setattr(sms_handler.database, "get_permitted_contacts", lambda _: permitted)
    monkeypatch.setattr(sms_handler.database, "get_session", lambda _: {"stage": "AWAITING_TARGET", "target_phone": None, "target_username": None})
    monkeypatch.setattr(sms_handler.database, "update_session", lambda *_a, **_kw: None)
    monkeypatch.setattr(sms_handler.database, "has_unregistered_warning", lambda _: False)

    reply, fwd_num, fwd_body, reason = sms_handler.handle_incoming_sms(
        "+639171234567", "[target] +639172222222"
    )

    assert reason == "TARGET_SET"


def test_has_permission_endpoint_returns_true_when_granted(monkeypatch):
    monkeypatch.setattr(
        "database.has_outbound_permission",
        lambda sapot, external: sapot == "+639171111111" and external == "+639288888888"
    )
    from api import app as gsm_app
    client = TestClient(gsm_app)

    resp = client.get(
        "/has-permission",
        params={"sapot_phone": "+639171111111", "external_phone": "+639288888888"},
        headers={"X-GSM-Secret": "test-gsm-secret"},
    )

    assert resp.status_code == 200
    assert resp.json() == {"permitted": True}


def test_has_permission_endpoint_returns_false_when_not_granted(monkeypatch):
    monkeypatch.setattr("database.has_outbound_permission", lambda *_: False)
    from api import app as gsm_app
    client = TestClient(gsm_app)

    resp = client.get(
        "/has-permission",
        params={"sapot_phone": "+639171111111", "external_phone": "+639299999999"},
        headers={"X-GSM-Secret": "test-gsm-secret"},
    )

    assert resp.status_code == 200
    assert resp.json() == {"permitted": False}
