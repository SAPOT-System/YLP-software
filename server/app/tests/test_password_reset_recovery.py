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


# ---------------------------------------------------------------------------
# Task 2: GET /users/recovery-key must NOT burn the token
# ---------------------------------------------------------------------------

from fastapi.testclient import TestClient
from app.main import app
from app.db_operations.auth import get_session
from app.db_operations.wrapped_key_recovery import (
    upsert_recovery_blob,
)


@pytest.fixture(name="web_session")
def web_session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="web_client")
def web_client_fixture(web_session):
    app.dependency_overrides[get_session] = lambda: web_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_recovery_key_does_not_burn_token(web_client, web_session):
    """GET /users/recovery-key must return blob WITHOUT consuming the session."""
    user_id = uuid.uuid4()
    upsert_recovery_blob(web_session, user_id, "email", "BLOB_PAYLOAD")
    result = create_recovery_session(
        web_session, user_id, "email", datetime.utcnow() + timedelta(minutes=15)
    )
    raw_token = result["raw_token"]

    r1 = web_client.get("/users/recovery-key", params={"recovery_token": raw_token, "method": "email"})
    assert r1.status_code == 200
    assert r1.json()["wrapped_blob"] == "BLOB_PAYLOAD"

    # Same token must work a second time (not burned)
    r2 = web_client.get("/users/recovery-key", params={"recovery_token": raw_token, "method": "email"})
    assert r2.status_code == 200, f"Token was burned prematurely; got {r2.status_code}"
