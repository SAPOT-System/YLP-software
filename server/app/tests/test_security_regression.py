"""
Regression tests for TC-246 and TC-247.

TC-246: /testing/* endpoints must require admin authentication.
TC-247: /gps/ws/monitor/rescuers/{id} must require a valid rescuer token.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.admin import makeAdmin
from app.models.users import User
from app.models.rescuer import Rescuer
from app.db_operations.auth import get_password_hash
from app.tests.test_db_utils import get_auth_headers


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def plain_user(session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        username="plain_tc246",
        first_name="Plain",
        last_name="User",
        hashed_password=get_password_hash("PlainPass1"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def admin_user(session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        username="admin_tc246",
        first_name="Admin",
        last_name="User",
        hashed_password=get_password_hash("AdminPass1"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    makeAdmin(user, session)
    return user


@pytest.fixture
def rescuer_user(session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        username="rescuer_tc247",
        first_name="Rescuer",
        last_name="User",
        hashed_password=get_password_hash("RescuerPass1"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    rescuer = Rescuer(id=uuid.uuid4(), user_id=user.id)
    session.add(rescuer)
    session.commit()
    return user


def _token(client: TestClient, username: str, password: str) -> str:
    headers = get_auth_headers(client, username, password)
    return headers["Authorization"].removeprefix("Bearer ")


# ---------------------------------------------------------------------------
# TC-246 — /testing/* endpoints must require admin auth
# ---------------------------------------------------------------------------

class TestTC246TestingEndpointsRequireAdmin:

    def test_make_admin_rejects_unauthenticated(self, client: TestClient, plain_user: User):
        resp = client.post(f"/testing/test-make-admin?username={plain_user.username}")
        assert resp.status_code == 401

    def test_make_rescuer_rejects_unauthenticated(self, client: TestClient, plain_user: User):
        resp = client.post(f"/testing/test-make-rescuer?username={plain_user.username}")
        assert resp.status_code == 401

    def test_make_admin_rejects_non_admin_token(self, client: TestClient, plain_user: User):
        headers = get_auth_headers(client, plain_user.username, "PlainPass1")
        resp = client.post(
            f"/testing/test-make-admin?username={plain_user.username}",
            headers=headers,
        )
        assert resp.status_code == 403

    def test_make_rescuer_rejects_non_admin_token(self, client: TestClient, plain_user: User):
        headers = get_auth_headers(client, plain_user.username, "PlainPass1")
        resp = client.post(
            f"/testing/test-make-rescuer?username={plain_user.username}",
            headers=headers,
        )
        assert resp.status_code == 403

    def test_make_admin_succeeds_with_admin_token(
        self, client: TestClient, plain_user: User, admin_user: User
    ):
        headers = get_auth_headers(client, admin_user.username, "AdminPass1")
        resp = client.post(
            f"/testing/test-make-admin?username={plain_user.username}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_make_rescuer_succeeds_with_admin_token(
        self, client: TestClient, plain_user: User, admin_user: User
    ):
        headers = get_auth_headers(client, admin_user.username, "AdminPass1")
        resp = client.post(
            f"/testing/test-make-rescuer?username={plain_user.username}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_make_admin_returns_404_for_unknown_username(
        self, client: TestClient, admin_user: User
    ):
        headers = get_auth_headers(client, admin_user.username, "AdminPass1")
        resp = client.post(
            "/testing/test-make-admin?username=does_not_exist",
            headers=headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-247 — /gps/ws/monitor/rescuers/{id} must require a valid rescuer token
# ---------------------------------------------------------------------------

class TestTC247MonitorWebSocketRequiresRescuerAuth:

    def test_rejects_missing_token(self, client: TestClient, rescuer_user: User):
        rescuer_id = str(rescuer_user.id)
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/gps/ws/monitor/rescuers/{rescuer_id}"  # no ?token=
            ) as ws:
                ws.receive_text()

    def test_rejects_invalid_token(self, client: TestClient, rescuer_user: User):
        rescuer_id = str(rescuer_user.id)
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/gps/ws/monitor/rescuers/{rescuer_id}?token=not-a-real-token"
            ) as ws:
                ws.receive_text()

    def test_rejects_non_rescuer_token(self, client: TestClient, plain_user: User):
        token = _token(client, plain_user.username, "PlainPass1")
        # Use the plain user's own ID so the ID check would pass — rescuer check must still reject
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/gps/ws/monitor/rescuers/{plain_user.id}?token={token}"
            ) as ws:
                ws.receive_text()

    def test_rejects_rescuer_token_with_mismatched_id(
        self, client: TestClient, rescuer_user: User
    ):
        token = _token(client, rescuer_user.username, "RescuerPass1")
        wrong_id = str(uuid.uuid4())
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/gps/ws/monitor/rescuers/{wrong_id}?token={token}"
            ) as ws:
                ws.receive_text()

    def test_accepts_valid_rescuer_token(self, client: TestClient, rescuer_user: User):
        token = _token(client, rescuer_user.username, "RescuerPass1")
        rescuer_id = str(rescuer_user.id)
        with client.websocket_connect(
            f"/gps/ws/monitor/rescuers/{rescuer_id}?token={token}"
        ) as ws:
            assert ws.scope["path"] == f"/gps/ws/monitor/rescuers/{rescuer_id}"
