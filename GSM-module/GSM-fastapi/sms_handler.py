"""
sms_handler.py
──────────────
Business logic for incoming SMS messages.

Returns (reply, forward_number, forward_body, rejection_reason).
The caller (api.py _process_incoming) sends them via the serial worker.

Message length rule: every constant must stay under 160 chars
(SMS max) so the Arduino PC_BUF=160 never truncates them.
"""

import logging
import re
import unicodedata
from typing import Optional, Tuple

import database
from config import settings

logger = logging.getLogger("sapot.handler")

AUTHORIZED: Optional[list] = None   # None = open, list = whitelist

# ── All outbound message templates (all <= 160 chars) ─────────────────────────

MSG_WELCOME = (
    "Welcome to SAPOT relay. Send your target number:\n"
    "[target] +639XXXXXXXXX"
)                                                          # 71 chars

MSG_NO_ACCOUNT = (
    "Your number is not registered in SAPOT. "
    "Please create an account first."
)                                                          # 71 chars

MSG_TARGET_NOT_FOUND = (
    "That number is not in SAPOT. Please try another."
)                                                          # 49 chars

MSG_UNAUTHORIZED  = "Not authorised to use this service."  # 35 chars
MSG_NEED_TARGET   = "Set a target first:\n[target] +639XXXXXXXXX"  # 42 chars
MSG_INVALID_FMT   = "Bad format. Use:\n[target] +639XXXXXXXXX"     # 39 chars
MSG_NO_ARG        = "Provide a number: [target] +639XXXXXXXXX"     # 40 chars
MSG_FORWARD_FAIL  = "Could not forward your message. Please try again."  # 50

MSG_NOT_PERMITTED = (
    "No SAPOT user has contacted this number. "
    "Ask them to message you first."
)                                                          # 72 chars

MSG_TARGET_NOT_PERMITTED = (
    "That number has not contacted you. "
    "Only permitted SAPOT contacts can be targeted."
)                                                          # 82 chars

def _msg_target_set(username: str, phone: str) -> str:
    return f"Target: {username} ({phone}). Messages go to them now."
    # e.g. "Target: maria_santos (+639281234567). Messages go to them now." = 63


def _msg_forwarded(username: str) -> str:
    return f"Forwarded to {username} via SMS & SAPOT app."
    # e.g. "Forwarded to maria_santos via SMS & SAPOT app." = 46


def _forward_body(sender_phone: str, body: str) -> str:
    """
    What the TARGET receives. Clean, no unnecessary prefix clutter.
    Just the sender's number and their message.
    e.g. "From +639171234567: Hello there"
    Max useful body = 160 - len("From +639171234567: ") = 140 chars.
    """
    prefix = f"From {sender_phone}: "
    max_body = 160 - len(prefix)
    if len(body) > max_body:
        body = body[:max_body - 1] + "…"
    return prefix + body


# ── Types ─────────────────────────────────────────────────────────────────────

ForwardTuple = Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]
# (reply_to_sender, forward_to_number, forward_body, rejection_reason)


# ── Main entry point ──────────────────────────────────────────────────────────

def handle_incoming_sms(number: str, body: str) -> ForwardTuple:
    number = _normalize_phone(number)
    if number is None:
        logger.warning("Rejected malformed sender number")
        return None, None, None, "MALFORMED_SENDER"
    body = " ".join(unicodedata.normalize("NFKC", body).split())
    logger.info("SMS received from %s (%d characters)", database._redact_phone(number), len(body))
    sender_user = database.get_user_by_phone(number)
    
    if not sender_user:
        logger.warning("Account does not exist: %s", database._redact_phone(number))
        if database.has_unregistered_warning(number):
            return None, None, None, "NO_ACCOUNT"
        return MSG_NO_ACCOUNT, None, None, "NO_ACCOUNT"
    
    if sender_user.get("banned"):
        logger.warning("Banned: %s", database._redact_phone(number))
        return (
            "This number has been banned by the system",
            None,
            None,
            "BANNED_SENDER",
        )
    if   not sender_user.get("phone_is_verified"):
        logger.warning("Unverified number: %s", database._redact_phone(number))
        return (
            "Please verify your account first.",
            None,
            None,
            "UNVERIFIED_SENDER",
        )

    sender = database.lookup_number(number)
    if sender is None:
        return MSG_NO_ACCOUNT, None, None, "NO_ACCOUNT"

    if body.upper() == "STOP":
        database.set_sms_opt_out(number, True)
        return "SMS relay messages are disabled for this number. Reply START to enable them.", None, None, "OPT_OUT"
    if body.upper() == "START":
        database.set_sms_opt_out(number, False)
        return "SMS relay messages are enabled for this number.", None, None, "OPT_IN"

    session = database.get_session(number)
    stage   = session["stage"]

    # [target] works from any stage
    if body.lower().startswith("[target]"):
        return _cmd_set_target(number, body)

    if stage == "NEW":
        permitted = database.get_permitted_contacts(number)
        if not permitted:
            return MSG_NOT_PERMITTED, None, None, "NOT_PERMITTED"
        if len(permitted) == 1:
            target = database.lookup_number(permitted[0])
            if target:
                database.update_session(
                    number,
                    stage="ACTIVE",
                    target_phone=permitted[0],
                    target_username=target["username"],
                )
                return (
                    f"Welcome. Routing to {target['username']}. "
                    "Send any message to reach them.",
                    None,
                    None,
                    "WELCOME",
                )
        database.update_session(number, stage="AWAITING_TARGET")
        return MSG_WELCOME, None, None, "WELCOME"

    if stage == "AWAITING_TARGET":
        return MSG_NEED_TARGET, None, None, "AWAITING_TARGET"

    if stage == "ACTIVE":
        return _do_forward(number, body, session)

    database.reset_session(number)
    return MSG_WELCOME, None, None, "WELCOME"


def _normalize_phone(number: str) -> Optional[str]:
    normalized = unicodedata.normalize("NFKC", number).strip().replace(" ", "")
    if re.fullmatch(r"09\d{9}", normalized):
        normalized = "+63" + normalized[1:]
    elif re.fullmatch(r"639\d{9}", normalized):
        normalized = "+" + normalized
    if normalized.startswith("00"):
        normalized = "+" + normalized[2:]
    if re.fullmatch(r"\+639\d{9}", normalized):
        return normalized
    return None


# ── Sub-handlers ──────────────────────────────────────────────────────────────

def _cmd_set_target(number: str, body: str) -> ForwardTuple:
    # body is like "[target] +639281234567" or "[target]" (no arg)
    parts = body.split(None, 1)
    if len(parts) < 2 or not parts[1].strip():
        return MSG_NO_ARG, None, None, "TARGET_NO_ARGUMENT"

    target_phone = _normalize_phone(parts[1])

    if target_phone is None:
        return MSG_INVALID_FMT, None, None, "TARGET_INVALID_FORMAT"

    # Sender cannot target themselves
    if target_phone == number:
        return "You cannot set yourself as the target.", None, None, "SELF_TARGET"

    permitted = database.get_permitted_contacts(number)
    if target_phone not in permitted:
        return MSG_TARGET_NOT_PERMITTED, None, None, "TARGET_NOT_PERMITTED"

    target = database.lookup_number(target_phone)
    if target is None:
        return MSG_TARGET_NOT_FOUND, None, None, "TARGET_NOT_FOUND"

    database.update_session(
        number,
        stage="ACTIVE",
        target_phone=target_phone,
        target_username=target["username"],
    )

    return _msg_target_set(target["username"], target_phone), None, None, "TARGET_SET"


def _do_forward(sender_phone: str, body: str, session: dict) -> ForwardTuple:
    target_phone    = session.get("target_phone")
    target_username = session.get("target_username")

    target_user = database.get_user_by_phone(target_phone)

    if not target_user:
        logger.warning("Target does not exist: %s", database._redact_phone(target_phone))
        return f"Target {target_phone} does not exist.", None, None, "TARGET_MISSING"

    if database.is_sms_opted_out(target_phone):
        return "That target has opted out of SMS relay messages.", None, None, "TARGET_OPTED_OUT"

    if target_user.get("banned"):
        logger.warning("Banned: %s", database._redact_phone(target_phone))
        return (
            f"This number ({target_phone}) has been banned by the system.",
            None,
            None,
            "TARGET_BANNED",
        )
    if   not target_user.get("phone_is_verified"):
        logger.warning("Unverified number: %s", database._redact_phone(target_phone))
        return f"Target {target_phone} is not verified.", None, None, "TARGET_UNVERIFIED"

    if not target_phone:
        database.reset_session(sender_phone)
        return MSG_WELCOME, None, None, "WELCOME"

    if not database.allow_sender_target(
        sender_phone, target_phone, settings.sms_sender_target_daily_limit
    ):
        return "Relay limit reached. Please try again tomorrow.", None, None, "RELAY_LIMIT"

    ok = database.notify_app(sender_phone, target_phone, body)
    logger.info("notify_app result: %s (sender=%s target=%s)", ok, database._redact_phone(sender_phone), database._redact_phone(target_phone))
    if not ok:
        return MSG_FORWARD_FAIL, None, None, "APP_DELIVERY_FAILED"

    # Build clean forward body for the target's SMS
    fwd = _forward_body(sender_phone, body)

    return _msg_forwarded(target_username), target_phone, fwd, "FORWARDED"
