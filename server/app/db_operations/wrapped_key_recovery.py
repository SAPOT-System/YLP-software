import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.models.wrapped_key_recovery import WrappedKeyRecovery
from app.models.recovery_session import RecoverySession


def upsert_recovery_blob(
    session,
    user_id: uuid.UUID,
    method: str,
    wrapped_blob: str,
    metadata: str | None = None,
) -> WrappedKeyRecovery:
    existing = session.exec(
        select(WrappedKeyRecovery).where(
            WrappedKeyRecovery.user_id == user_id,
            WrappedKeyRecovery.method == method,
        )
    ).first()
    if existing:
        existing.wrapped_blob = wrapped_blob
        existing.recovery_metadata = metadata
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        return existing
    row = WrappedKeyRecovery(
        user_id=user_id,
        method=method,
        wrapped_blob=wrapped_blob,
        recovery_metadata=metadata,
    )
    session.add(row)
    return row


def bulk_upsert_recovery_blobs(
    session,
    user_id: uuid.UUID,
    blobs: list[dict],
) -> None:
    for item in blobs:
        upsert_recovery_blob(
            session,
            user_id,
            item["method"],
            item["wrapped_blob"],
            item.get("metadata"),
        )
    session.commit()


def get_recovery_blob(
    session,
    user_id: uuid.UUID,
    method: str,
) -> WrappedKeyRecovery | None:
    return session.exec(
        select(WrappedKeyRecovery).where(
            WrappedKeyRecovery.user_id == user_id,
            WrappedKeyRecovery.method == method,
        )
    ).first()


def create_recovery_session(
    session,
    user_id: uuid.UUID,
    method: str,
    expires_at: datetime,
) -> dict:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    existing = session.exec(
        select(RecoverySession).where(
            RecoverySession.user_id == user_id,
            RecoverySession.method == method,
            RecoverySession.used == False,
        )
    ).all()
    for row in existing:
        session.delete(row)

    rec = RecoverySession(
        user_id=user_id,
        token_hash=token_hash,
        method=method,
        expires_at=expires_at,
    )
    session.add(rec)
    session.commit()
    return {"raw_token": raw_token}


def validate_recovery_session(session, raw_token: str) -> RecoverySession:
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    rec = session.exec(
        select(RecoverySession).where(RecoverySession.token_hash == token_hash)
    ).first()
    if not rec:
        raise HTTPException(status_code=403, detail="Invalid recovery token")
    if rec.used:
        raise HTTPException(status_code=403, detail="Recovery token already used")
    if rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=403, detail="Recovery token expired")
    return rec


def consume_recovery_session(session, recovery_session: RecoverySession) -> None:
    recovery_session.used = True
    session.add(recovery_session)
    session.commit()


def mark_recovery_session_used(session, recovery_session: RecoverySession) -> None:
    """Mark session used. Does NOT commit -- caller owns the transaction."""
    recovery_session.used = True
    session.add(recovery_session)
