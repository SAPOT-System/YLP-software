"""
Regression tests for TC-247 and the GH #276 `/testing/*` production guard.

TC-247: /gps/ws/monitor/rescuers/{id} must require a valid rescuer token.

GH #276 (`require_qa_env`): every `/testing/*` route must 404 in a production process,
including when the router is deliberately mis-mounted.
"""
import os
from pathlib import Path
import subprocess
import sys
import textwrap
import uuid
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.users import User
from app.models.rescuer import Rescuer
from app.db_operations.auth import get_password_hash
from app.tests.test_db_utils import get_auth_headers


def test_gsm_secret_is_required_at_import_time():
    """GH #244: a missing GSM webhook secret must prevent server startup."""
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": "sqlite:////tmp/gsm-secret-import-test.db",
            "JWT_SECRET_KEY": "gsm-secret-import-test",
            "CORS_ALLOWED_ORIGINS": "http://testserver",
            "SERVER_ED25519_SEED": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        }
    )
    env.pop("GSM_SECRET", None)

    result = subprocess.run(
        [sys.executable, "-c", "import app.api.gsm"],
        cwd=Path(__file__).resolve().parents[2],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "GSM_SECRET environment variable is not set" in result.stderr


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


# ---------------------------------------------------------------------------
# GH #276: /testing/* must 404 outside a QA-enabled environment
# ---------------------------------------------------------------------------

class TestQAGuardProductionLockout:

    def test_qa_api_token_is_required_at_import_time(self):
        env = os.environ.copy()
        env.update(
            {
                "DATABASE_URL": "sqlite:////tmp/qa-token-import-test.db",
                "JWT_SECRET_KEY": "qa-token-import-test",
                "CORS_ALLOWED_ORIGINS": "http://testserver",
                "ENVIRONMENT": "development",
            }
        )
        env.pop("QA_API_TOKEN", None)

        result = subprocess.run(
            [sys.executable, "-c", "import app.api.testing"],
            cwd=Path(__file__).resolve().parents[2],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode != 0
        assert "QA_API_TOKEN environment variable is not set" in result.stderr

    def test_every_testing_path_returns_404_in_production_process(self):
        env = os.environ.copy()
        env.update(
            {
                "DATABASE_URL": "sqlite:////tmp/qa-production-lockout-test.db",
                "JWT_SECRET_KEY": "qa-production-lockout-test",
                "CORS_ALLOWED_ORIGINS": "http://testserver",
                "GSM_SECRET": "qa-production-lockout-test",
                "SERVER_ED25519_SEED": (
                    "0123456789abcdef0123456789abcdef"
                    "0123456789abcdef0123456789abcdef"
                ),
                "ENVIRONMENT": "production",
            }
        )
        env.pop("QA_API_TOKEN", None)

        script = textwrap.dedent(
            """
            import re

            from fastapi import FastAPI
            from fastapi.routing import APIRoute
            from fastapi.testclient import TestClient

            from app.main import app
            from app.api import testing

            routes = [route for route in testing.router.routes if isinstance(route, APIRoute)]

            def assert_all_routes_return_404(client):
                for route in routes:
                    path = re.sub(r"{[^}]+}", "fixture", route.path)
                    for method in route.methods:
                        response = client.request(method, path)
                        assert response.status_code == 404, (method, path, response.status_code)

            assert_all_routes_return_404(TestClient(app))

            mis_mounted_app = FastAPI()
            mis_mounted_app.include_router(testing.router)
            assert_all_routes_return_404(TestClient(mis_mounted_app))
            """
        )

        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=Path(__file__).resolve().parents[2],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode == 0, result.stderr

    def test_require_qa_env_raises_404_when_qa_disabled(self, monkeypatch):
        from app.api import testing as testing_module

        monkeypatch.setattr(testing_module, "IS_QA_ENABLED", False)
        with pytest.raises(HTTPException) as exc_info:
            testing_module.require_qa_env()
        assert exc_info.value.status_code == 404

    def test_require_qa_env_passes_when_qa_enabled(self, monkeypatch):
        from app.api import testing as testing_module

        monkeypatch.setattr(testing_module, "IS_QA_ENABLED", True)
        testing_module.require_qa_env()  # must not raise

    def test_require_qa_token_rejects_missing_header(self):
        from app.api import testing as testing_module

        with pytest.raises(HTTPException) as exc_info:
            testing_module.require_qa_token(x_qa_token=None)
        assert exc_info.value.status_code == 404

    def test_require_qa_token_rejects_wrong_token(self):
        from app.api import testing as testing_module

        with pytest.raises(HTTPException) as exc_info:
            testing_module.require_qa_token(x_qa_token="not-the-real-token")
        assert exc_info.value.status_code == 404

    def test_require_qa_token_accepts_correct_token(self):
        from app.api import testing as testing_module

        testing_module.require_qa_token(x_qa_token=testing_module.QA_API_TOKEN)  # must not raise

    def test_every_testing_route_depends_on_require_qa_env(self):
        from app.api import testing as testing_module

        for route in testing_module.router.routes:
            dependant_calls = {dep.call for dep in route.dependant.dependencies}
            assert testing_module.require_qa_env in dependant_calls, (
                f"{route.path} is missing Depends(require_qa_env)"
            )

    def test_every_mutating_testing_route_depends_on_require_qa_token(self):
        from app.api import testing as testing_module

        for route in testing_module.router.routes:
            if route.methods == {"GET"}:
                continue
            dependant_calls = {dep.call for dep in route.dependant.dependencies}
            assert testing_module.require_qa_token in dependant_calls, (
                f"{route.path} is missing Depends(require_qa_token)"
            )
