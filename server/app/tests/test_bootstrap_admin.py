from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import select

from app.db_operations.auth import get_password_hash, verify_password
from app.db_operations.token import _assert_password_current, create_token_pair
from app.limiter import limiter
from app.models.admin import Admin
from app.models.users import BootstrapAdminCreate, User


@pytest.fixture(autouse=True)
def disable_rate_limits(monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)


def test_bootstrap_payload_keeps_identity_and_password_validation() -> None:
    payload = BootstrapAdminCreate(
        username="installer", first_name="Install", last_name="Operator",
        phone_number="+639171234567", password="StrongPass123",
    )
    assert payload.terms_accepted is False
    with pytest.raises(ValidationError):
        BootstrapAdminCreate(
            username="installer", first_name="Install", last_name="Operator",
            phone_number="+639171234567", password="weakpass",
        )


def test_password_change_gate_has_stable_error_shape() -> None:
    user = User(username="operator", first_name="Test", last_name="Operator", hashed_password="hash", must_change_password=True)
    with pytest.raises(HTTPException) as error:
        _assert_password_current(user)
    assert error.value.status_code == 403
    assert error.value.detail["code"] == "PASSWORD_CHANGE_REQUIRED"


def test_initial_password_change_requires_terms_and_is_atomic(client, session) -> None:
    user = User(
        username="bootstrap", first_name="Boot", last_name="Strap",
        hashed_password=get_password_hash("InitialPass123"), must_change_password=True,
    )
    session.add(user)
    session.commit()
    token = create_token_pair(user.id).access_token

    rejected = client.post("/auth/change-password", headers={"Authorization": f"Bearer {token}"}, json={"current_password": "InitialPass123", "new_password": "ChangedPass123"})
    assert rejected.status_code == 400
    assert rejected.json()["detail"]["code"] == "TERMS_ACCEPTANCE_REQUIRED"

    accepted = client.post("/auth/change-password", headers={"Authorization": f"Bearer {token}"}, json={"current_password": "InitialPass123", "new_password": "ChangedPass123", "terms_accepted": True})
    assert accepted.status_code == 200
    session.refresh(user)
    assert user.must_change_password is False
    assert user.terms_accepted_at is not None
    assert verify_password("ChangedPass123", user.hashed_password)


def test_initial_password_change_rejects_reusing_the_installer_password(client, session) -> None:
    user = User(
        username="reuser", first_name="Re", last_name="User",
        hashed_password=get_password_hash("InitialPass123"), must_change_password=True,
    )
    session.add(user)
    session.commit()
    token = create_token_pair(user.id).access_token

    response = client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "InitialPass123", "new_password": "InitialPass123", "terms_accepted": True},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "PASSWORD_REUSED"
    session.refresh(user)
    assert user.must_change_password is True
    assert user.terms_accepted_at is None


def test_password_change_reports_a_weak_password_as_a_client_error(client, session) -> None:
    user = User(
        username="shortpw", first_name="Short", last_name="Password",
        hashed_password=get_password_hash("InitialPass123"), must_change_password=True,
    )
    session.add(user)
    session.commit()
    token = create_token_pair(user.id).access_token

    response = client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "InitialPass123", "new_password": "Aa1", "terms_accepted": True},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "PASSWORD_TOO_WEAK"
    session.refresh(user)
    assert user.must_change_password is True
    assert verify_password("InitialPass123", user.hashed_password)


def test_flagged_admin_is_blocked_from_admin_routes_but_can_still_log_out(client, session) -> None:
    user = session.exec(select(User).where(User.username == "test")).one()
    session.add(Admin(user_id=user.id))
    session.commit()

    login = client.post("/api/admin/login", data={"username": "test", "password": "test_password"})
    assert login.status_code == 200
    assert login.json()["must_change_password"] is False
    token = login.json()["access_token"]

    user.must_change_password = True
    session.add(user)
    session.commit()

    blocked = client.get("/api/admin/me", headers={"Authorization": f"Bearer {token}"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    client.cookies.set("refresh_token", login.json()["refresh_token"])
    logout = client.post("/api/admin/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout.status_code == 200


def test_password_change_does_not_replace_existing_consent(client, session) -> None:
    accepted_at = datetime(2026, 8, 1, tzinfo=timezone.utc)
    user = User(username="accepted", first_name="Terms", last_name="Accepted", hashed_password=get_password_hash("InitialPass123"), must_change_password=True, terms_accepted_at=accepted_at)
    session.add(user)
    session.commit()
    token = create_token_pair(user.id).access_token
    response = client.post("/auth/change-password", headers={"Authorization": f"Bearer {token}"}, json={"current_password": "InitialPass123", "new_password": "ChangedPass123"})
    assert response.status_code == 200
    session.refresh(user)
    assert user.terms_accepted_at == accepted_at.replace(tzinfo=None)
