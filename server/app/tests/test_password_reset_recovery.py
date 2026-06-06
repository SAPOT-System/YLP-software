import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.models.recovery_session import RecoverySession
from app.db_operations.wrapped_key_recovery import (
    create_recovery_session,
    mark_recovery_session_used,  # does not exist yet -> ImportError
)


@pytest.fixture(name="mem_session")
def mem_session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _seed_rec_session(session) -> tuple[str, RecoverySession]:
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    rec = RecoverySession(
        user_id=uuid.uuid4(),
        token_hash=token_hash,
        method="email",
        expires_at=datetime.utcnow() + timedelta(minutes=15),
        used=False,
    )
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return raw, rec


def test_mark_recovery_session_used_sets_flag_without_committing(mem_session):
    _, rec = _seed_rec_session(mem_session)
    assert rec.used is False

    mark_recovery_session_used(mem_session, rec)

    assert rec.used is True  # set in memory

    # If the helper committed, rollback would not undo the flag
    mem_session.rollback()
    refreshed = mem_session.get(RecoverySession, rec.id)
    assert refreshed.used is False, "mark_recovery_session_used must NOT commit internally"
