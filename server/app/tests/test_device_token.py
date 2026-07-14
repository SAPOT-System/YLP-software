from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.admin import Admin
from app.models.admin_push_token import AdminPushToken
from app.models.users import User


def test_admin_push_token_table_is_created(session: Session):
    # The `session` fixture (conftest.py) calls SQLModel.metadata.create_all,
    # so the table exists only if the model is registered in metadata.
    rows = session.exec(select(AdminPushToken)).all()
    assert rows == []


def _login_as_admin(client, session, username="test", password="test_password"):
    user = session.exec(select(User).where(User.username == username)).one()
    session.add(Admin(user_id=user.id))
    session.commit()
    resp = client.post("/admin/login", data={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def test_register_device_token_creates_one_row(client: TestClient, session: Session):
    token = _login_as_admin(client, session)
    resp = client.post(
        "/admin/device-token",
        headers={"Authorization": f"Bearer {token}"},
        json={"token": "fcm-abc", "platform": "android"},
    )
    assert resp.status_code == 200
    rows = session.exec(select(AdminPushToken)).all()
    assert len(rows) == 1
    assert rows[0].token == "fcm-abc"


def test_reregistering_same_token_updates_last_seen_not_duplicates(client, session):
    token = _login_as_admin(client, session)
    headers = {"Authorization": f"Bearer {token}"}
    body = {"token": "fcm-abc", "platform": "android"}

    client.post("/admin/device-token", headers=headers, json=body)
    first = session.exec(select(AdminPushToken)).one()
    first_seen = first.last_seen

    client.post("/admin/device-token", headers=headers, json=body)
    session.expire_all()
    rows = session.exec(select(AdminPushToken)).all()
    assert len(rows) == 1
    assert rows[0].last_seen >= first_seen


def test_register_device_token_requires_admin(client: TestClient):
    resp = client.post(
        "/admin/device-token", json={"token": "x", "platform": "android"}
    )
    assert resp.status_code == 401


def test_register_device_token_rejects_empty_token(client, session):
    token = _login_as_admin(client, session)
    resp = client.post(
        "/admin/device-token",
        headers={"Authorization": f"Bearer {token}"},
        json={"token": "", "platform": "android"},
    )
    assert resp.status_code == 422
