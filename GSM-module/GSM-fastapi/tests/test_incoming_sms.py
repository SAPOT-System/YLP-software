from types import SimpleNamespace

import pytest

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
