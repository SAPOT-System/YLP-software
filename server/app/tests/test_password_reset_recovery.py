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


# ---------------------------------------------------------------------------
# Task 3: POST /reset-password burns recovery_token atomically
# ---------------------------------------------------------------------------

from app.db_operations.forgot_password import generate_reset_token, store_reset_token_in_db
from app.models.users import User
from app.db_operations.auth import get_password_hash


def _seed_reset_token(session, user_id) -> str:
    result = generate_reset_token()
    store_reset_token_in_db(
        user_id=user_id,
        token_hash=result["token_hash"],
        expires_at=datetime.utcnow() + timedelta(minutes=30),
        session=session,
    )
    return result["raw_token"]


def _seed_user(session, username: str) -> uuid.UUID:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        username=username,
        email=f"{username}@test.com",
        first_name="T",
        last_name="T",
        hashed_password=get_password_hash("OldPassword1!"),
    )
    session.add(user)
    session.commit()
    return user_id


def test_reset_password_burns_recovery_token_on_success(web_client, web_session):
    user_id = _seed_user(web_session, "burn_test")
    reset_token = _seed_reset_token(web_session, user_id)
    rec_result = create_recovery_session(
        web_session, user_id, "email", datetime.utcnow() + timedelta(minutes=15)
    )
    raw_recovery = rec_result["raw_token"]

    r = web_client.post(
        "/auth/forgot-password/reset-password",
        params={"token": reset_token},
        json={"new_password": "NewPassword1!", "recovery_token": raw_recovery},
    )
    assert r.status_code == 200

    token_hash = hashlib.sha256(raw_recovery.encode()).hexdigest()
    rec = web_session.exec(
        select(RecoverySession).where(RecoverySession.token_hash == token_hash)
    ).first()
    assert rec is not None and rec.used is True


def test_reset_password_succeeds_without_recovery_token(web_client, web_session):
    user_id = _seed_user(web_session, "norec_test")
    reset_token = _seed_reset_token(web_session, user_id)

    r = web_client.post(
        "/auth/forgot-password/reset-password",
        params={"token": reset_token},
        json={"new_password": "NewPassword1!"},
    )
    assert r.status_code == 200


def test_reset_password_succeeds_with_invalid_recovery_token(web_client, web_session):
    user_id = _seed_user(web_session, "invalid_rec_test")
    reset_token = _seed_reset_token(web_session, user_id)

    r = web_client.post(
        "/auth/forgot-password/reset-password",
        params={"token": reset_token},
        json={"new_password": "NewPassword1!", "recovery_token": "garbage-token"},
    )
    assert r.status_code == 200, "Password reset must succeed even when recovery_token is invalid"


# ---------------------------------------------------------------------------
# GET /auth/forgot-password/security-question must 404 (not crash) for an
# identifier that matches no user. Found via the Postman baseline suite:
# get_user() returns None for an unknown identifier, and the handler
# previously dereferenced `current_user.id` unconditionally, turning any
# unknown identifier into a 500.
# ---------------------------------------------------------------------------

def test_get_security_question_404s_for_unknown_identifier(web_client, web_session):
    r = web_client.get(
        "/auth/forgot-password/security-question",
        params={"identifier": "no-such-user@test.com"},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "User not found"
