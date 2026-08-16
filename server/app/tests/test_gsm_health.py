import logging

import httpx

from app.api import gsm
from app.db_operations.token import get_current_user
from app.main import app


class UnavailableGsmClient:
    async def get(self, path: str, **_kwargs):
        raise httpx.ConnectError("All connection attempts failed")


class DegradedGsmClient:
    async def get(self, path: str, **_kwargs):
        return httpx.Response(
            503,
            json={
                "status": "degraded",
                "gsm_ready": False,
                "connected": True,
                "detail": "network unavailable",
            },
        )


def test_gsm_health_reports_unavailable_gateway(client, monkeypatch, caplog):
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: UnavailableGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: None)

    with caplog.at_level(logging.WARNING, logger="app"):
        response = client.get("/gsm/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "GSM gateway is unavailable"}
    assert "GSM gateway health check unavailable" in caplog.text
    log_record = next(record for record in caplog.records if record.name == "app")
    assert log_record.user_id == "ANONYMOUS"
    assert log_record.action == "gsm_health_unavailable"
    assert log_record.metadata_json == {"path": "/health"}


def test_gsm_health_preserves_degraded_gateway_status(client, monkeypatch):
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: DegradedGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: None)

    response = client.get("/gsm/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "gsm_ready": False,
        "connected": True,
        "detail": "network unavailable",
    }
