#!/usr/bin/env python3
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from sqlmodel import SQLModel, Session, StaticPool, create_engine

from app.db_operations.device_attempts import (
    ATTEMPT_BUDGETS,
    COOLDOWN_TIERS,
    check_and_increment_attempt,
    reset_attempts,
)
from app.models.login_attempt import LoginAttempt, RecoveryAttempt
from app.models.device_key import DeviceKey


@pytest.fixture(name="mem_session")
def mem_session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_anonymous_budget_defined():
    assert "anonymous" in ATTEMPT_BUDGETS
    assert ATTEMPT_BUDGETS["anonymous"] > 0


def test_anonymous_cooldown_defined():
    assert "anonymous" in COOLDOWN_TIERS
    assert len(COOLDOWN_TIERS["anonymous"]) == 4


def test_anonymous_lockout_after_budget_exhausted(mem_session):
    user_id = uuid.uuid4()
    client_ip = "1.2.3.4"
    budget = ATTEMPT_BUDGETS["anonymous"]

    for i in range(budget):
        result = check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")
        assert result["allowed"] is True, f"attempt {i + 1} should be allowed"

    result = check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")
    assert result["allowed"] is False
    assert result["attempts_remaining"] == 0
    assert result["locked_until"] is not None
    # First lockout tier is 15 minutes
    expected_cooldown = timedelta(minutes=COOLDOWN_TIERS["anonymous"][0])
    actual_cooldown = result["locked_until"] - datetime.now(timezone.utc)
    assert abs(actual_cooldown.total_seconds() - expected_cooldown.total_seconds()) < 5


def test_anonymous_lockout_does_not_affect_different_ip(mem_session):
    user_id = uuid.uuid4()
    budget = ATTEMPT_BUDGETS["anonymous"]

    for _ in range(budget + 1):
        check_and_increment_attempt(mem_session, user_id, "1.2.3.4", "anonymous")

    result = check_and_increment_attempt(mem_session, user_id, "9.9.9.9", "anonymous")
    assert result["allowed"] is True


def test_anonymous_lockout_count_escalates_cooldown(mem_session):
    user_id = uuid.uuid4()
    client_ip = "1.2.3.4"
    budget = ATTEMPT_BUDGETS["anonymous"]

    # First lockout — exhaust budget
    for _ in range(budget + 1):
        check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")

    # Simulate expiry: reset attempt_count and locked_until but keep lockout_count
    from sqlmodel import select as _select
    from app.models.login_attempt import LoginAttempt as _LA
    row = mem_session.exec(
        _select(_LA).where(_LA.user_id == user_id, _LA.device_fingerprint == client_ip)
    ).first()
    assert row is not None
    assert row.lockout_count == 1
    row.attempt_count = 0
    row.locked_until = None
    mem_session.add(row)
    mem_session.commit()

    # Second lockout — exhaust budget again
    for _ in range(budget):
        check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")
    result = check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")

    assert result["allowed"] is False
    # Second lockout should use tier 1 cooldown (60 min), not tier 0 (15 min)
    expected_cooldown = timedelta(minutes=COOLDOWN_TIERS["anonymous"][1])
    actual_cooldown = result["locked_until"] - datetime.now(timezone.utc)
    assert abs(actual_cooldown.total_seconds() - expected_cooldown.total_seconds()) < 5


def test_reset_clears_anonymous_lockout(mem_session):
    user_id = uuid.uuid4()
    client_ip = "1.2.3.4"
    budget = ATTEMPT_BUDGETS["anonymous"]

    for _ in range(budget + 1):
        check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")

    reset_attempts(mem_session, user_id, client_ip)

    result = check_and_increment_attempt(mem_session, user_id, client_ip, "anonymous")
    assert result["allowed"] is True


# ---------------------------------------------------------------------------
# Integration tests — IP gate on POST /auth/token
# These use the shared `client` fixture from conftest.py (all sample_users seeded).
# ---------------------------------------------------------------------------

from fastapi.testclient import TestClient
from app.tests.assets import sample_users as _sample_users

_TEST_USERNAME = _sample_users["test"]["username"]
_TEST_PASSWORD = _sample_users["test"]["password"]


def _bad_login(client: TestClient, ip: str = "1.2.3.4") -> int:
    return client.post(
        "/auth/token",
        data={"grant_type": "password", "username": _TEST_USERNAME, "password": "WRONG"},
        headers={"X-Forwarded-For": ip},
    ).status_code


def test_ip_gate_allows_attempts_below_budget(client):
    budget = ATTEMPT_BUDGETS["anonymous"]
    for _ in range(budget - 1):
        assert _bad_login(client) == 401


def test_ip_gate_locks_after_budget_exhausted(client):
    budget = ATTEMPT_BUDGETS["anonymous"]
    for _ in range(budget):
        _bad_login(client)
    assert _bad_login(client) == 429


def test_ip_gate_does_not_affect_different_ip(client):
    budget = ATTEMPT_BUDGETS["anonymous"]
    for _ in range(budget + 1):
        _bad_login(client, ip="1.2.3.4")
    assert _bad_login(client, ip="9.9.9.9") == 401


def test_ip_gate_lockout_response_shape(client):
    budget = ATTEMPT_BUDGETS["anonymous"]
    for _ in range(budget):
        _bad_login(client)
    res = client.post(
        "/auth/token",
        data={"grant_type": "password", "username": _TEST_USERNAME, "password": "WRONG"},
        headers={"X-Forwarded-For": "1.2.3.4"},
    )
    assert res.status_code == 429
    body = res.json()["detail"]
    assert "locked_until" in body
    assert body["device_type"] == "anonymous"
    assert body["attempts_remaining"] == 0


def test_successful_login_resets_ip_attempts(client):
    budget = ATTEMPT_BUDGETS["anonymous"]
    for _ in range(budget - 1):
        _bad_login(client)
    res = client.post(
        "/auth/token",
        data={"grant_type": "password", "username": _TEST_USERNAME, "password": _TEST_PASSWORD},
        headers={"X-Forwarded-For": "1.2.3.4"},
    )
    assert res.status_code == 200
    for _ in range(budget - 1):
        assert _bad_login(client) == 401
