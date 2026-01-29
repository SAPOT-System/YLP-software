#!/usr/bin/env python3

import uuid
from fastapi.testclient import TestClient
from fastapi.testclient import TestClient

from app.tests.assets import sample_users, dummy_data
from app.db_operations.auth import SessionDep, db_create_user
from app.models.users import UserCreate


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


sample_user = {
        'name':"emmanuel",
        'email':"Emmanuel@gmail.com",
        'phone_number':"093985984598",
        'password':"hi world"
}

def test_auth_create_account(client: TestClient):
    response = client.post('/auth', json=sample_user)

    assert response.status_code == 201

    response_data = response.json()
    assert response_data.get('name') == sample_user.get('name')
    assert response_data.get('email') == sample_user.get('email')
    assert response_data.get('phone_number') == sample_user.get('phone_number')


def test_auth_create_account_with_id(client: TestClient):
    id = str(uuid.uuid4())
    response = client.post('/auth', json={
        **sample_user,
        'id': id
    })

    assert response.status_code == 201

    response_data = response.json()
    assert response_data.get('id') == id
    assert response_data.get('name') == sample_user.get('name')
    assert response_data.get('email') == sample_user.get('email')
    assert response_data.get('phone_number') == sample_user.get('phone_number')
