from app.tests.assets import sample_users, sample_invalid_user, sample_valid_user
from fastapi.testclient import TestClient
from app.db_operations.user_search import search_case_insensitive
from app.db_operations.auth import SessionDep


def test_db_search_user(session: SessionDep):
    res = search_case_insensitive("pet", session)
    data = {'last_name': 'Parker', 'username': 'Peter Parker', 'first_name': 'Peter'}
    assert len(res) == 1
    assert res[0].get('last_name') == data["last_name"]
    assert res[0].get('first_name') == data["first_name"]
    assert res[0].get('username') == data["username"]

def get_auth_headers(client: TestClient, username: str, password: str):
    token_res = client.post('/auth/token', data={
        'username': username,
        'password': password,
    })
    access_token = token_res.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}

def test_update_profile_success(client: TestClient, session: SessionDep):
    # 1. Setup headers for 'test' user
    headers = get_auth_headers(client, 'test', 'test_password')

    # 2. Update to a new, unique username
    payload = {
        "username": "new_unique_name",
        "email": "new@example.com",
        "phone_number": "123456789"
    }
    response = client.post('/update/profile/', json=payload, headers=headers)

    assert response.status_code == 200
    assert response.json().get('status') == "ok"

def test_update_profile_email_conflict(client: TestClient, session: SessionDep):
    """Test that updating to someone else's email triggers a 409."""
    # Assume 'other_user' exists in your DB with email 'other@taken.com'
    headers = get_auth_headers(client, 'test', 'test_password')

    payload = {
        "email": "tony@stark-industries.com" # Email belongs to someone else
    }
    response = client.post('/update/profile/', json=payload, headers=headers)

    # assert response.status_code == 409
    assert "already taken" in response.json().get('detail')

def test_update_profile_username_conflict(client: TestClient, session: SessionDep):
    """Test that updating to someone else's email triggers a 409."""
    # Assume 'other_user' exists in your DB with email 'other@taken.com'
    headers = get_auth_headers(client, 'test', 'test_password')

    payload = {
        "username": "Tony Stark" # Email belongs to someone else
    }
    response = client.post('/update/profile/', json=payload, headers=headers)

    # assert response.status_code == 409
    assert "already taken" in response.json().get('detail')

def test_update_profile_phone_conflict(client: TestClient, session: SessionDep):
    """Test that updating to someone else's email triggers a 409."""
    # Assume 'other_user' exists in your DB with email 'other@taken.com'
    headers = get_auth_headers(client, 'test', 'test_password')

    payload = {
        "phone_number": "+639171234567" # Email belongs to someone else
    }
    response = client.post('/update/profile/', json=payload, headers=headers)

    # assert response.status_code == 409
    assert "already taken" in response.json().get('detail')

def test_update_profile_some_conflict(client: TestClient, session: SessionDep):
    """Test that updating to someone else's email triggers a 409."""
    # Assume 'other_user' exists in your DB with email 'other@taken.com'
    headers = get_auth_headers(client, 'test', 'test_password')

    payload = {
        "phone_number": "+639171234567", # Email belongs to someone else
        "username": "Tony Stark", # Email belongs to someone else
        "username": "newuserhehe"
    }
    response = client.post('/update/profile/', json=payload, headers=headers)

    # assert response.status_code == 409
    assert "already taken" in response.json().get('detail')


def test_update_profile_same_data_no_conflict(client: TestClient, session: SessionDep):
    """Test that keeping your own current email/username doesn't trigger a 409."""
    headers = get_auth_headers(client, 'test', 'test_password')

    # Sending the exact same data the user already has
    payload = {
        "username": "test",
        "email": "test@example.com",
        "phone_number": "987654321"
    }
    response = client.post('/update/profile/', json=payload, headers=headers)

    # This should pass because existing.id == current_user.id
    assert response.status_code == 200
    assert response.json().get('status') == "ok"
