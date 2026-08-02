from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.admin import Admin
from app.models.users import User


def _login_as_admin(client: TestClient, session: Session, username: str, password: str) -> str:
    user = session.exec(select(User).where(User.username == username)).one()
    session.add(Admin(user_id=user.id))
    session.commit()

    response = client.post(
        "/admin/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_get_my_admin_info_returns_current_admin_profile(client: TestClient, session: Session):
    access_token = _login_as_admin(client, session, "test", "test_password")

    response = client.get(
        "/admin/me",
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
    response = client.get("/admin/me")

    assert response.status_code == 401


def test_get_my_admin_info_rejects_non_admin_user(client: TestClient, session: Session):
    response = client.post(
        "/auth/token",
        data={"username": "Tony Stark", "password": "ironman_secret"},
    )
    assert response.status_code == 200
    access_token = response.json()["access_token"]

    response = client.get(
        "/admin/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401


def test_logout_without_refresh_token_cookie_returns_401_not_500(client: TestClient, session: Session):
    # Regression: the missing-cookie branch used to hardcode HTTPException(500),
    # even though it's a routine client error (no cookie sent) -- the sibling
    # /admin/refresh endpoint already treats the same condition as a 401.
    access_token = _login_as_admin(client, session, "test", "test_password")

    response = client.post(
        "/admin/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401
