from fastapi.testclient import TestClient
from fastapi import HTTPException
from datetime import datetime, timedelta, timezone
import pytest
from sqlmodel import Session, select

from app.api import admin
from app.models.admin import Admin
from app.models.banned_user import BannedUser
from app.models.rescuer import Rescuer
from app.models.users import User, UserCreateThroughAdmin, UserUpdateThroughAdmin


def _login_as_admin(client: TestClient, session: Session, username: str, password: str) -> str:
    user = session.exec(select(User).where(User.username == username)).one()
    session.add(Admin(user_id=user.id))
    session.commit()

    response = client.post(
        "/api/admin/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_get_my_admin_info_returns_current_admin_profile(client: TestClient, session: Session):
    access_token = _login_as_admin(client, session, "test", "test_password")

    response = client.get(
        "/api/admin/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    body = response.json()

    user = session.exec(select(User).where(User.username == "test")).one()
    assert body["id"] == str(user.id)
    assert body["username"] == "test"
    assert body["first_name"] == "Test"
    assert body["last_name"] == "User"
    assert body["email"] == "test@test.com"
    assert body["phone_number"] == "+638788667676"
    assert body["email_verified"] == user.email_verified
    assert body["role"] == "admin"


def test_get_my_admin_info_requires_bearer_token(client: TestClient):
    response = client.get("/api/admin/me")

    assert response.status_code == 401


def test_get_my_admin_info_rejects_non_admin_user(client: TestClient, session: Session):
    response = client.post(
        "/auth/token",
        data={"username": "Tony Stark", "password": "ironman_secret"},
    )
    assert response.status_code == 200
    access_token = response.json()["access_token"]

    response = client.get(
        "/api/admin/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401


def test_logout_without_refresh_token_cookie_returns_401_not_500(client: TestClient, session: Session):
    # Regression: the missing-cookie branch used to hardcode HTTPException(500),
    # even though it's a routine client error (no cookie sent) -- the sibling
    # /api/admin/refresh endpoint already treats the same condition as a 401.
    access_token = _login_as_admin(client, session, "test", "test_password")

    response = client.post(
        "/api/admin/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401


def test_admin_edit_rolls_back_profile_when_role_change_fails(session: Session, monkeypatch):
    user = session.exec(select(User).where(User.username == "test")).one()
    user_id = user.id
    original_username = user.username
    update = UserUpdateThroughAdmin(
        id=user_id,
        username="updated-admin-user",
        is_admin=True,
        is_rescuer=False,
    )

    def fail_role_grant(*args, **kwargs):
        raise RuntimeError("role write failed")

    monkeypatch.setattr(admin, "makeAdmin", fail_role_grant)

    with pytest.raises(HTTPException) as exc_info:
        admin.edit_user(user, update, session)

    assert exc_info.value.status_code == 500
    session.expire_all()
    persisted_user = session.exec(select(User).where(User.id == user_id)).one()
    assert persisted_user.username == original_username


def test_admin_edit_preserves_roles_when_role_fields_are_omitted(session: Session):
    user = session.exec(select(User).where(User.username == "test")).one()
    session.add_all([Admin(user_id=user.id), Rescuer(user_id=user.id)])
    session.commit()
    session.expire_all()
    user = session.exec(select(User).where(User.username == "test")).one()

    result = admin.edit_user(
        user,
        UserUpdateThroughAdmin(id=user.id, username="renamed-admin-user"),
        session,
    )

    assert result == {"status": "ok"}
    session.expire_all()
    persisted_user = session.exec(select(User).where(User.id == user.id)).one()
    assert persisted_user.admin is not None
    assert persisted_user.rescuer is not None


def test_admin_create_rolls_back_user_and_role_when_role_grant_fails(session: Session, monkeypatch):
    actor = session.exec(select(User).where(User.username == "test")).one()
    user_data = UserCreateThroughAdmin(
        username="atomic-admin-user",
        first_name="Atomic",
        last_name="Admin",
        password="StrongPass123",
        is_rescuer=True,
        is_admin=True,
    )

    def fail_admin_grant(*args, **kwargs):
        raise RuntimeError("role write failed")

    monkeypatch.setattr(admin, "makeAdmin", fail_admin_grant)

    with pytest.raises(HTTPException) as exc_info:
        admin.create_user(actor, user_data, session)

    assert exc_info.value.status_code == 500
    assert session.exec(select(User).where(User.username == "atomic-admin-user")).first() is None


def test_unban_only_updates_requested_user(session: Session):
    actor = session.exec(select(User).where(User.username == "test")).one()
    target = session.exec(select(User).where(User.username == "Tony Stark")).one()
    other = session.exec(select(User).where(User.username == "Steve Rogers")).one()
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
    session.add_all([
        BannedUser(user_id=target.id, until=expires_at),
        BannedUser(user_id=other.id, until=expires_at),
    ])
    session.commit()

    admin.unban_user(actor, target.id, session)

    session.expire_all()
    target_ban = session.exec(select(BannedUser).where(BannedUser.user_id == target.id)).one()
    other_ban = session.exec(select(BannedUser).where(BannedUser.user_id == other.id)).one()
    assert target_ban.until < expires_at
    assert other_ban.until == expires_at
