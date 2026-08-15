from types import SimpleNamespace

import pytest

import api
import sms_handler


@pytest.mark.parametrize(
    ("sender", "expected_reason"),
    [
        (None, "NO_ACCOUNT"),
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
