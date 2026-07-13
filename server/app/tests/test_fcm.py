import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.admin import Admin
from app.models.fcm_device_token import FcmDeviceToken
from app.tests.test_db_utils import get_auth_headers

DEVICE_TOKEN_PATH = "/admin/device-token"


@pytest.fixture
def test_admin(session: Session, test_user_instance):
    """Links an Admin profile to the standard test user (mirrors test_rescuer)."""
    admin = Admin(id=uuid.uuid4(), user_id=test_user_instance.id)
    session.add(admin)
    session.commit()
    session.refresh(admin)
    return admin


@pytest.fixture
def admin_header(client: TestClient, test_admin):
    """Bearer header for the admin-linked test user."""
    return get_auth_headers(client, "testusername", "test_password")


def test_register_device_token_creates_row(client, session, admin_header):
    response = client.post(
        DEVICE_TOKEN_PATH,
        json={"token": "fcm-token-abc", "platform": "android"},
        headers=admin_header,
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    rows = session.exec(
        select(FcmDeviceToken).where(FcmDeviceToken.token == "fcm-token-abc")
    ).all()
    assert len(rows) == 1
    assert rows[0].platform == "android"


def test_register_device_token_is_idempotent(client, session, admin_header):
    payload = {"token": "fcm-token-abc", "platform": "android"}

    first = client.post(DEVICE_TOKEN_PATH, json=payload, headers=admin_header)
    second = client.post(DEVICE_TOKEN_PATH, json=payload, headers=admin_header)

    assert first.status_code == 200
    assert second.status_code == 200

    rows = session.exec(
        select(FcmDeviceToken).where(FcmDeviceToken.token == "fcm-token-abc")
    ).all()
    assert len(rows) == 1


def test_register_multiple_tokens_for_same_admin(client, session, admin_header):
    client.post(
        DEVICE_TOKEN_PATH,
        json={"token": "device-1", "platform": "android"},
        headers=admin_header,
    )
    client.post(
        DEVICE_TOKEN_PATH,
        json={"token": "device-2", "platform": "android"},
        headers=admin_header,
    )

    rows = session.exec(select(FcmDeviceToken)).all()
    assert {row.token for row in rows} == {"device-1", "device-2"}
    # Both rows belong to a single admin (fan-out to all devices).
    assert len({row.user_id for row in rows}) == 1


def test_register_device_token_requires_auth(client):
    response = client.post(
        DEVICE_TOKEN_PATH, json={"token": "anon-token", "platform": "android"}
    )

    assert response.status_code == 401


def test_register_device_token_rejects_non_admin(client, session):
    # The 'test' sample user exists but has no Admin row.
    headers = get_auth_headers(client, "test", "test_password")

    response = client.post(
        DEVICE_TOKEN_PATH,
        json={"token": "non-admin-token", "platform": "android"},
        headers=headers,
    )

    assert response.status_code == 401
    rows = session.exec(select(FcmDeviceToken)).all()
    assert rows == []
