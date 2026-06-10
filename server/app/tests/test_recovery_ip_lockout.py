"""Tests that recovery endpoints apply IP-based lockout when device fields are absent."""
import hashlib
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db_operations.device_attempts import ATTEMPT_BUDGET
from app.models.users import User
from app.models.securityQuestions import UserSecurityQuestion
from app.db_operations.auth import get_password_hash
from app.models.PasswordResetCode import PasswordResetCode
from app.models.PhonePasswordResetCode import PhonePasswordResetCode

IP_A = {"X-Forwarded-For": "10.0.0.1"}
IP_B = {"X-Forwarded-For": "10.0.0.2"}
BUDGET = ATTEMPT_BUDGET


@pytest.fixture
def user_with_question(client: TestClient, session: Session):
    user = session.exec(select(User).where(User.username == "test")).first()
    q = UserSecurityQuestion(
        user_id=user.id,
        question="Favourite colour?",
        answer_hash=get_password_hash("blue"),
        is_burned=False,
    )
    session.add(q)
    session.commit()
    return user


@pytest.fixture
def email_code(session: Session):
    user = session.exec(select(User).where(User.username == "test")).first()
    record = PasswordResetCode(
        email=user.email,
        code="111111",
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(record)
    session.commit()
    return record


@pytest.fixture
def phone_code(session: Session):
    user = session.exec(select(User).where(User.username == "test")).first()
    code_hash = hashlib.sha256(b"222222").hexdigest()
    record = PhonePasswordResetCode(
        phone_number=user.phone_number or "+10000000000",
        code=code_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(record)
    session.commit()
    return record


def _wrong_question(client: TestClient, headers: dict) -> int:
    return client.post(
        "/auth/forgot-password/security-question/answer",
        params={"identifier": "test"},
        json={"question": "Favourite colour?", "answer": "wrong"},
        headers=headers,
    ).status_code


def _wrong_email(client: TestClient, email: str, headers: dict) -> int:
    return client.post(
        "/auth/forgot-password/email-code",
        params={"email": email, "code": "XXXXXX"},
        headers=headers,
    ).status_code


def _wrong_phone(client: TestClient, phone: str, headers: dict) -> int:
    return client.post(
        "/auth/forgot-password/phone-code",
        json={"phone_number": phone, "code": "XXXXXX"},
        headers=headers,
    ).status_code


def test_security_question_ip_lockout(client: TestClient, user_with_question):
    for _ in range(BUDGET):
        _wrong_question(client, IP_A)
    assert _wrong_question(client, IP_A) == 429


def test_security_question_other_ip_unaffected(client: TestClient, user_with_question):
    for _ in range(BUDGET + 1):
        _wrong_question(client, IP_A)
    assert _wrong_question(client, IP_B) == 200  # returns correct=false, not 429


def test_email_code_ip_lockout(client: TestClient, email_code):
    for _ in range(BUDGET):
        _wrong_email(client, email_code.email, IP_A)
    assert _wrong_email(client, email_code.email, IP_A) == 429


def test_email_code_other_ip_unaffected(client: TestClient, email_code):
    for _ in range(BUDGET + 1):
        _wrong_email(client, email_code.email, IP_A)
    assert _wrong_email(client, email_code.email, IP_B) == 400  # invalid code, not 429


def test_phone_code_ip_lockout(client: TestClient, phone_code):
    for _ in range(BUDGET):
        _wrong_phone(client, phone_code.phone_number, IP_A)
    assert _wrong_phone(client, phone_code.phone_number, IP_A) == 429


def test_phone_code_other_ip_unaffected(client: TestClient, phone_code):
    for _ in range(BUDGET + 1):
        _wrong_phone(client, phone_code.phone_number, IP_A)
    assert _wrong_phone(client, phone_code.phone_number, IP_B) == 400  # invalid code, not 429


def test_lockout_response_shape(client: TestClient, user_with_question):
    for _ in range(BUDGET):
        _wrong_question(client, IP_A)
    resp = client.post(
        "/auth/forgot-password/security-question/answer",
        params={"identifier": "test"},
        json={"question": "Favourite colour?", "answer": "wrong"},
        headers=IP_A,
    )
    assert resp.status_code == 429
    body = resp.json()["detail"]
    assert "locked_until" in body
    assert body["attempts_remaining"] == 0
