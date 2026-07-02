# server/app/tests/test_recovery_attempts.py
"""Tests that failed recovery verifications include attempts_remaining."""
from datetime import datetime, timedelta
import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.users import User
from app.models.securityQuestions import UserSecurityQuestion
from app.db_operations.auth import get_password_hash
from app.models.PasswordResetCode import PasswordResetCode
from app.models.PhonePasswordResetCode import PhonePasswordResetCode


IP = {"X-Forwarded-For": "10.20.30.40"}


@pytest.fixture
def user_with_security_question(client: TestClient, session: Session):
    """Creates security question for the test user (username=test)."""
    user = session.exec(select(User).where(User.username == "test")).first()
    q = UserSecurityQuestion(
        user_id=user.id,
        question="What is your pet's name?",
        answer_hash=get_password_hash("fluffy"),
        is_burned=False,
    )
    session.add(q)
    session.commit()
    return user


@pytest.fixture
def email_reset_code(session: Session):
    """Seeds a valid email reset code for test@test.com."""
    user = session.exec(select(User).where(User.username == "test")).first()
    record = PasswordResetCode(
        email=user.email,
        code="123456",
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(record)
    session.commit()
    return record


@pytest.fixture
def phone_reset_code(session: Session):
    """Seeds a valid phone reset code."""
    user = session.exec(select(User).where(User.username == "test")).first()
    code_hash = hashlib.sha256(b"654321").hexdigest()
    record = PhonePasswordResetCode(
        phone_number=user.phone_number or "+10000000000",
        code=code_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(record)
    session.commit()
    return record


def test_wrong_security_answer_includes_attempts_remaining(
    client: TestClient, user_with_security_question
):
    resp = client.post(
        "/auth/forgot-password/security-question/answer",
        params={"identifier": "test"},
        json={"question": "What is your pet's name?", "answer": "wronganswer"},
        headers=IP,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["correct"] is False
    assert "attempts_remaining" in body


def test_wrong_email_code_includes_attempts_remaining(
    client: TestClient, email_reset_code
):
    resp = client.post(
        "/auth/forgot-password/email-code",
        params={"email": email_reset_code.email, "code": "WRONG1"},
        headers=IP,
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert isinstance(detail, dict), "detail must be a dict, not a string"
    assert "attempts_remaining" in detail


def test_wrong_phone_code_includes_attempts_remaining(
    client: TestClient, phone_reset_code, session: Session
):
    user = session.exec(select(User).where(User.username == "test")).first()
    resp = client.post(
        "/auth/forgot-password/phone-code",
        json={"phone_number": phone_reset_code.phone_number, "code": "WRONGX"},
        headers=IP,
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert isinstance(detail, dict)
    assert "attempts_remaining" in detail
