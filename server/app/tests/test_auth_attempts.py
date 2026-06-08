"""Tests that the 401 response from /token includes attempts_remaining."""
import pytest
from fastapi.testclient import TestClient


def _login_wrong_password(client: TestClient, username: str = "test") -> dict:
    resp = client.post(
        "/api/auth/token",
        data={
            "username": username,
            "password": "definitely_wrong_password",
            "grant_type": "password",
        },
        headers={"X-Forwarded-For": "10.0.0.99"},
    )
    return resp


def test_401_includes_dict_detail(client):
    resp = _login_wrong_password(client)
    assert resp.status_code == 401
    detail = resp.json()["detail"]
    assert isinstance(detail, dict), "detail should be a dict, not a plain string"


def test_401_detail_has_message_field(client):
    resp = _login_wrong_password(client)
    detail = resp.json()["detail"]
    assert "message" in detail
    assert detail["message"] == "Incorrect credentials"


def test_401_detail_has_attempts_remaining_field(client):
    resp = _login_wrong_password(client)
    detail = resp.json()["detail"]
    assert "attempts_remaining" in detail
    assert isinstance(detail["attempts_remaining"], int)
    assert detail["attempts_remaining"] >= 0


def test_401_attempts_remaining_decrements_on_repeated_failures(client):
    first = _login_wrong_password(client).json()["detail"]["attempts_remaining"]
    second = _login_wrong_password(client).json()["detail"]["attempts_remaining"]
    assert second < first, "attempts_remaining should decrease after each failed attempt"
