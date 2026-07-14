import logging
import os

import firebase_admin
from firebase_admin import credentials
from firebase_admin import exceptions as fb_exceptions
from firebase_admin import messaging
from sqlmodel import Session, col, select

from app.db_operations.auth import engine
from app.models.admin_push_token import AdminPushToken

logger = logging.getLogger("app")

# The "app" logger's handlers (app/main.py) format every record with
# %(user_id)s/%(action)s/%(entity_id)s/%(metadata_json)s; calls without
# these `extra` keys raise inside the formatter (caught and printed by
# the logging module, not by us, but noisy). This module logs outside any
# HTTP request, so there's no real user/action to report — use placeholders.
_LOG_EXTRA = {
    "user_id": "-",
    "action": "-",
    "entity_id": "-",
    "metadata_json": {},
}


def init_firebase() -> None:
    """Initialize the default Firebase app exactly once (idempotent)."""
    if firebase_admin._apps:
        return
    cred_path = os.environ.get("FIREBASE_ADMIN_CREDENTIALS_PATH")
    if not cred_path:
        raise RuntimeError(
            "FIREBASE_ADMIN_CREDENTIALS_PATH environment variable is not set"
        )
    firebase_admin.initialize_app(credentials.Certificate(cred_path))
    logger.info("Firebase Admin SDK initialized", extra=_LOG_EXTRA)


def send_admin_alert(title: str, body: str) -> None:
    """Multicast an FCM alert to every registered admin device. Never raises."""
    admin_web_url = os.environ.get("ADMIN_WEB_URL", "")
    try:
        with Session(engine) as session:
            tokens = [row.token for row in session.exec(select(AdminPushToken)).all()]
            if not tokens:
                return

            message = messaging.MulticastMessage(
                tokens=tokens,
                notification=messaging.Notification(title=title, body=body),
                data={"url": admin_web_url},
            )
            batch = messaging.send_each_for_multicast(message)
            _delete_dead_tokens(session, tokens, batch)
    except Exception as exc:  # noqa: BLE001 — boundary: nothing may escape into loops
        logger.error("send_admin_alert failed: %s", exc, extra=_LOG_EXTRA)


def _delete_dead_tokens(session: Session, tokens: list[str], batch) -> None:
    dead = [
        token
        for token, resp in zip(tokens, batch.responses)
        if not resp.success
        and isinstance(
            resp.exception,
            (messaging.UnregisteredError, fb_exceptions.InvalidArgumentError),
        )
    ]
    if not dead:
        return
    for row in session.exec(
        select(AdminPushToken).where(col(AdminPushToken.token).in_(dead))
    ).all():
        session.delete(row)
    session.commit()
