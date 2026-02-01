#!/usr/bin/env python3

import uuid
from fastapi.testclient import TestClient
from fastapi.testclient import TestClient

from app.tests.assets import sample_users, sample_invalid_user, sample_valid_user
from app.db_operations.auth import SessionDep, db_create_user
from app.models.users import User, UserCreate


def test_auth_status(client:TestClient):
    response = client.get('/auth')
    assert response.status_code == 200
    assert response.json() == { 'status': 'auth endpoint is running properly' }


def test_auth_token(client:TestClient):
    sample_user = sample_users['test']
    form_data = {
        'username': sample_user.get('email'),
        'password': sample_user.get('password'),
    }
    response = client.post('/auth/token', data=form_data)

    token = response.json()

    assert "access_token" in token
    assert token['token_type'] == 'bearer'


def test_auth_token_with_username(client:TestClient):
    sample_user = sample_users['test']
    form_data = {
        'username': sample_user.get('username'),
        'password': sample_user.get('password'),
    }
    response = client.post('/auth/token', data=form_data)

    token = response.json()

    assert "access_token" in token
    assert token['token_type'] == 'bearer'


def test_auth_token_with_phone_number(client:TestClient):
    sample_user = sample_users['test']
    form_data = {
        'username': sample_user.get('phone_number'),
        'password': sample_user.get('password'),
    }
    response = client.post('/auth/token', data=form_data)

    token = response.json()

    assert "access_token" in token
    assert token['token_type'] == 'bearer'



def test_auth_create_account(client: TestClient, session: SessionDep):
    response = client.post('/auth', json=sample_valid_user)

    assert response.status_code == 201

    response_data = response.json()
    assert response_data.get('username') == sample_valid_user.get('username')
    assert response_data.get('email') == sample_valid_user.get('email')
    assert response_data.get('first_name') == sample_valid_user.get('first_name')
    assert response_data.get('last_name') == sample_valid_user.get('last_name')
    assert response_data.get('phone_number') == sample_valid_user.get('phone_number')

    from_db = session.get(User, uuid.UUID(response_data.get('id')))

    assert from_db
    assert from_db.username == sample_valid_user.get('username')
    assert from_db.first_name == sample_valid_user.get('first_name')
    assert from_db.last_name == sample_valid_user.get('last_name')
    assert from_db.email == sample_valid_user.get('email')
    assert from_db.phone_number == sample_valid_user.get('phone_number')


def test_auth_create_account_with_id(client: TestClient, session:SessionDep):
    id = str(uuid.uuid4())
    response = client.post('/auth', json={
        **sample_valid_user,
        'id': id
    })

    assert response.status_code == 201

    response_data = response.json()
    assert response_data.get('id') == id
    assert response_data.get('username') == sample_valid_user.get('username')
    assert response_data.get('first_name') == sample_valid_user.get('first_name')
    assert response_data.get('last_name') == sample_valid_user.get('last_name')
    assert response_data.get('email') == sample_valid_user.get('email')
    assert response_data.get('phone_number') == sample_valid_user.get('phone_number')

    from_db = session.get(User, uuid.UUID(response_data.get('id')))

    assert from_db
    assert from_db.username == sample_valid_user.get('username')
    assert from_db.first_name == sample_valid_user.get('first_name')
    assert from_db.last_name == sample_valid_user.get('last_name')
    assert from_db.email == sample_valid_user.get('email')
    assert from_db.phone_number == sample_valid_user.get('phone_number')


def test_auth_invalid_create_account(client:TestClient, session:SessionDep):
    response = client.post('/auth', json=sample_invalid_user)

    assert response.status_code == 422
    response_data = response.json()
    assert "detail" in response_data
