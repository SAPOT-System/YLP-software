#!/usr/bin/env python3

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert 200 == response.status_code
    assert {"state": "running"} == response.json()
