"""HTTP-level coverage for app/api/testing.py's QA scenario/reset/login-as surface
(GH #272, #273, #276). Assumes the shared `client`/`session` fixtures run with
`ENVIRONMENT=development` (see conftest.py, server/.env.example), the same
precondition every other `/testing/*` test in this suite already relies on.
"""
from app.api import testing as testing_module


QA_HEADERS = {"X-QA-Token": testing_module.QA_API_TOKEN}


def test_list_scenarios_returns_full_catalog(client):
    response = client.get("/testing/scenarios")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == set(testing_module.SCENARIOS.keys())


def test_seed_unknown_scenario_returns_404(client):
    response = client.post("/testing/seed/does-not-exist", headers=QA_HEADERS)
    assert response.status_code == 404


def test_seed_requires_qa_token(client):
    response = client.post("/testing/seed/roles")
    assert response.status_code == 404


def test_seed_roles_scenario_creates_fixtures(client):
    response = client.post("/testing/seed/roles", headers=QA_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["scenario"] == "roles"
    assert body["result"]["rescuer"] == "qa_rescuer"


def test_seed_gps_roles_scenario_creates_multi_role_fixtures(client):
    response = client.post("/testing/seed/gps-roles", headers=QA_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["scenario"] == "gps-roles"
    assert body["result"]["admins"] == ["qa_map_admin"]
    assert body["result"]["rescuers"] == ["qa_map_rescuer", "qa_map_rescuer_2"]


def test_seed_verified_phone_scenario_creates_login_fixture(client):
    response = client.post("/testing/seed/verified-phone", headers=QA_HEADERS)
    assert response.status_code == 200
    assert response.json()["result"] == {"user": "qa_phone_verified", "phone_verified": True}

    login = client.post("/testing/login-as/qa_phone_verified", headers=QA_HEADERS)
    assert login.status_code == 200
    assert login.json()["username"] == "qa_phone_verified"


def test_login_as_qa_map_rescuer_mints_usable_tokens(client):
    client.post("/testing/seed/gps-roles", headers=QA_HEADERS)

    response = client.post("/testing/login-as/qa_map_rescuer", headers=QA_HEADERS)
    assert response.status_code == 200
    assert response.json()["username"] == "qa_map_rescuer"


def test_reset_requires_qa_token(client):
    response = client.post("/testing/reset")
    assert response.status_code == 404


def test_reset_with_valid_token_reseeds_baseline(client):
    response = client.post("/testing/reset", headers=QA_HEADERS)
    assert response.status_code == 200
    assert response.json()["reseeded"] == "baseline"


def test_login_as_unknown_handle_returns_404(client):
    response = client.post("/testing/login-as/not-a-fixture", headers=QA_HEADERS)
    assert response.status_code == 404


def test_login_as_requires_qa_token(client):
    response = client.post("/testing/login-as/admin")
    assert response.status_code == 404


def test_login_as_unseeded_fixture_returns_404(client):
    response = client.post("/testing/login-as/qa_rescuer", headers=QA_HEADERS)
    assert response.status_code == 404


def test_login_as_mints_usable_tokens(client):
    client.post("/testing/seed/roles", headers=QA_HEADERS)

    response = client.post("/testing/login-as/qa_admin", headers=QA_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "qa_admin"
    assert body["access_token"]
    assert body["refresh_token"]

    me = client.get(
        "/user-utils/current-user-info",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == "qa_admin"


def test_login_as_admin_returns_a_valid_email(client):
    # Regression: the "admin" fixture (built by the "baseline" scenario) used
    # to hardcode "admin@sapot.local" -- ".local" is a special-use TLD that
    # EmailStr rejects, so serializing UserPublic 500'd on every request.
    client.post("/testing/reset", headers=QA_HEADERS)

    response = client.post("/testing/login-as/admin", headers=QA_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "admin"
    assert body["email"] == "admin@example.com"
    assert body["access_token"]
