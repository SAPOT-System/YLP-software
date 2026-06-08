import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from sqlmodel import Session, select

from app.models.login_attempt import LoginAttempt, RecoveryAttempt

ATTEMPT_BUDGET = 5

MINUTE = 60
HOUR = 60 * MINUTE
DAY = 24 * HOUR

COOLDOWN_TIERS = [15, 60, 6 * HOUR, DAY]


def _get_or_create_login_attempt(
    session: Session,
    user_id: uuid.UUID,
    identifier: str,
) -> LoginAttempt:
    row = session.exec(
        select(LoginAttempt).where(
            LoginAttempt.user_id == user_id,
            LoginAttempt.device_fingerprint == identifier,
        ).with_for_update()
    ).first()
    if not row:
        row = LoginAttempt(
            user_id=user_id,
            device_fingerprint=identifier,
            device_type="anonymous",
        )
        session.add(row)
        session.flush()
    return row


def _get_or_create_recovery_attempt(
    session: Session,
    user_id: uuid.UUID,
    identifier: str,
    recovery_method: str,
) -> RecoveryAttempt:
    row = session.exec(
        select(RecoveryAttempt).where(
            RecoveryAttempt.user_id == user_id,
            RecoveryAttempt.device_fingerprint == identifier,
            RecoveryAttempt.recovery_method == recovery_method,
        ).with_for_update()
    ).first()
    if not row:
        row = RecoveryAttempt(
            user_id=user_id,
            device_fingerprint=identifier,
            device_type="anonymous",
            recovery_method=recovery_method,
        )
        session.add(row)
        session.flush()
    return row


def check_and_increment_attempt(
    session: Session,
    user_id: uuid.UUID,
    identifier: str,
    *,
    table: Literal["login", "recovery"] = "login",
    recovery_method: Optional[str] = None,
) -> dict:
    now = datetime.now(timezone.utc)

    if table == "login":
        row = _get_or_create_login_attempt(session, user_id, identifier)
    else:
        row = _get_or_create_recovery_attempt(session, user_id, identifier, recovery_method or "")

    if row.locked_until:
        locked_until_aware = row.locked_until.replace(tzinfo=timezone.utc) if row.locked_until.tzinfo is None else row.locked_until
        if locked_until_aware > now:
            return {"allowed": False, "locked_until": locked_until_aware, "attempts_remaining": 0}
        row.attempt_count = 0
        row.locked_until = None

    row.attempt_count += 1
    row.last_attempt_at = now
    remaining = ATTEMPT_BUDGET - row.attempt_count

    if remaining <= 0:
        tier = min(row.lockout_count, len(COOLDOWN_TIERS) - 1)
        locked_until = now + timedelta(seconds=COOLDOWN_TIERS[tier])
        row.locked_until = locked_until
        row.lockout_count += 1
        session.add(row)
        session.commit()
        return {"allowed": False, "locked_until": locked_until, "attempts_remaining": 0}

    session.add(row)
    session.commit()
    return {"allowed": True, "locked_until": None, "attempts_remaining": remaining}


def reset_attempts(
    session: Session,
    user_id: uuid.UUID,
    identifier: str,
    *,
    table: Literal["login", "recovery"] = "login",
    recovery_method: Optional[str] = None,
) -> None:
    if table == "login":
        row = session.exec(
            select(LoginAttempt).where(
                LoginAttempt.user_id == user_id,
                LoginAttempt.device_fingerprint == identifier,
            )
        ).first()
    else:
        row = session.exec(
            select(RecoveryAttempt).where(
                RecoveryAttempt.user_id == user_id,
                RecoveryAttempt.device_fingerprint == identifier,
                RecoveryAttempt.recovery_method == (recovery_method or ""),
            )
        ).first()

    if row:
        row.attempt_count = 0
        row.locked_until = None
        session.add(row)
        session.commit()
