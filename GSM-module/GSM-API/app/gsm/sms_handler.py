"""
sapot/sms_handler.py
────────────────────
All business logic for incoming SMS messages.

handle_sms(number, body, session_manager, database)
  → returns the reply string to send back, or None if no reply needed.

The handler is pure Python with no serial or I/O concerns.
It only reads/writes sessions and calls the database stub.
"""

from typing import Optional
import logging

from app.gsm.session_manager import SessionManager, Stage
import app.gsm.database 

logger = logging.getLogger("sapot.sms")


# ── Whitelist ─────────────────────────────────────────────────────────────────
# Numbers allowed to use the relay.  Empty list = open access (not recommended).
# Set to None to disable whitelisting entirely during development.
AUTHORIZED: Optional[list] = None   # e.g. ["+639171234567"]


# ── Welcome / help messages ───────────────────────────────────────────────────
MSG_WELCOME = (
    "Hi! Welcome to SAPOT SMS relay. "
    "Please enter your target recipient in this format:\n"
    "[target] +639XXXXXXXXX"
)

MSG_TARGET_NOT_FOUND = (
    "This user does not exist within the SAPOT database. "
    "Please enter a valid number."
)

MSG_TARGET_NO_ACCOUNT = (
    "Your phone number does not exist within the SAPOT database. "
    "Please create an account first."
)

MSG_UNAUTHORIZED = (
    "Sorry, your number is not authorised to use this service."
)


def _forwarded_reply(username: str) -> str:
    return (
        f"Your message was forwarded to {username} both through SMS "
        f"and the SAPOT app."
    )


# ═══════════════════════════════════════════════════════════════════════════════

def handle_sms(number: str, body: str,
               sessions: SessionManager) -> Optional[str]:
    """
    Main entry point.  Returns reply text or None.

    Parameters
    ----------
    number  : sender's E.164 phone number  e.g. "+639171234567"
    body    : raw SMS body
    sessions: shared SessionManager instance
    """
    body = body.strip()
    logger.info("Handling SMS from %s: %r", number, body)

    # ── Authorisation check ───────────────────────────────────────────────────
    if AUTHORIZED is not None and number not in AUTHORIZED:
        logger.warning("Unauthorised number: %s", number)
        return MSG_UNAUTHORIZED

    # ── Verify sender exists in SAPOT ─────────────────────────────────────────
    sender_record = app.gsm.database.lookup_number(number)
    if sender_record is None:
        return MSG_TARGET_NO_ACCOUNT

    session = sessions.get(number)

    # ── Did the user send a [target] command? ─────────────────────────────────
    if body.lower().startswith("[target]"):
        return _handle_set_target(body, session)

    # ── Route based on current stage ──────────────────────────────────────────
    if session.stage == Stage.NEW:
        session.stage = Stage.AWAITING_TARGET
        return MSG_WELCOME

    if session.stage == Stage.AWAITING_TARGET:
        # They haven't set a target yet but sent something other than [target]
        return (
            "Please set your target recipient first:\n"
            "[target] +639XXXXXXXXX"
        )

    if session.stage == Stage.ACTIVE:
        return _handle_forward(number, body, session)

    # Fallback
    session.reset()
    return MSG_WELCOME


# ── Sub-handlers ──────────────────────────────────────────────────────────────

def _handle_set_target(body: str, session) -> str:
    """Parse '[target] +639...' and validate against the database."""
    parts = body.split(None, 1)   # split on first whitespace
    if len(parts) < 2:
        return "Please provide a phone number after [target]."

    target_number = parts[1].strip()

    # Basic E.164 sanity check
    if not target_number.startswith("+") or not target_number[1:].isdigit():
        return (
            "Invalid number format. Please use international format:\n"
            "[target] +639XXXXXXXXX"
        )

    target_record = app.gsm.database.lookup_number(target_number)

    if target_record is None:
        return MSG_TARGET_NOT_FOUND

    # Set target and move to ACTIVE stage
    session.target          = target_number
    session.target_username = target_record["username"]
    session.stage           = Stage.ACTIVE

    return (
        f"Target set to {target_record['username']} ({target_number}). "
        f"Your next messages will be forwarded to them."
    )


def _handle_forward(sender: str, body: str, session) -> str:
    """Forward the message to the current target via the SAPOT server."""
    success = app.gsm.database.forward_message(
        sender_number=sender,
        target_number=session.target,
        message=body,
    )

    if success:
        return _forwarded_reply(session.target_username)
    else:
        return "Failed to forward your message. Please try again later."
