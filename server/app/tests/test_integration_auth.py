#!/usr/bin/env python3

from fastapi.testclient import TestClient
from fastapi.testclient import TestClient

from app.tests.assets import sample_users


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
