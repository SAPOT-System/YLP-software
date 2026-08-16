import asyncio

import httpx

from app.api import gsm
from app.db_operations.token import get_current_user
from app.main import app
from app.models.phone_verification import PhoneVerification, PhoneVerified, now_ms
from app.models.users import User
from sqlmodel import select


QUEUE_FULL_RESPONSE = {
    "detail": {
        "message": "Outbound SMS queue is full",
        "reason": "QUEUE_FULL",
        "msg_id": "sms-log-id",
    }
}

SERVICE_STOPPING_RESPONSE = {
    "detail": {
        "message": "SMS service is stopping",
        "reason": "SERVICE_STOPPING",
        "msg_id": "sms-log-id",
    }
}


class FakeGsmResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    @property
    def is_error(self) -> bool:
        return self.status_code >= 400

    def json(self) -> dict:
        return self._payload


class SaturatedGsmClient:
    async def post(self, path: str, json: dict, **kwargs):
        return FakeGsmResponse(503, QUEUE_FULL_RESPONSE)


class StoppingGsmClient:
    async def post(self, path: str, json: dict, **kwargs):
        return FakeGsmResponse(503, SERVICE_STOPPING_RESPONSE)


class UnavailableGsmClient:
    async def post(self, path: str, json: dict, **kwargs):
        raise httpx.ConnectError("All connection attempts failed")


class ModemNotReadyGsmClient:
    async def post(self, path: str, json: dict, **kwargs):
        return FakeGsmResponse(503, {"detail": "GSM modem not ready"})


class PoolExhaustedGsmClient:
    async def post(self, path: str, json: dict, **kwargs):
        raise httpx.PoolTimeout("GSM proxy connection pool is full")


def _authenticated_user(session, *, phone_verified=False):
    user = session.exec(select(User)).first()
    if phone_verified:
        session.add(PhoneVerified(user_id=user.id))
        session.commit()
        session.refresh(user)
    return user


def test_proxy_capacity_timeouts_and_gateway_url_cover_gateway_contract(monkeypatch):
    captured = {}

    class CapturingClient:
        is_closed = False

        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(gsm, "_gsm_http_client", None)
    monkeypatch.setattr(gsm.httpx, "AsyncClient", CapturingClient)

    gsm._get_gsm_client()

    timeout = captured["timeout"]
    limits = captured["limits"]
    assert timeout.read == gsm.GSM_PROXY_READ_TIMEOUT_SECONDS
    assert timeout.read > gsm.GSM_GATEWAY_WORST_CASE_SECONDS
    assert timeout.pool == gsm.GSM_PROXY_POOL_TIMEOUT_SECONDS
    assert limits.max_connections == gsm.GSM_PROXY_MAX_CONNECTIONS
    assert limits.max_connections > gsm.GSM_GATEWAY_MAX_ADMITTED_REQUESTS
    assert captured["base_url"] == gsm.GSM_GATEWAY_URL


def test_proxy_uses_configured_gateway_url(monkeypatch):
    captured = {}

    class CapturingClient:
        is_closed = False

        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(gsm, "_gsm_http_client", None)
    monkeypatch.setattr(gsm, "GSM_GATEWAY_URL", "http://gsm-fastapi:8001")
    monkeypatch.setattr(gsm.httpx, "AsyncClient", CapturingClient)

    gsm._get_gsm_client()

    assert captured["base_url"] == "http://gsm-fastapi:8001"


def test_send_to_module_authenticates_with_shared_secret(monkeypatch):
    captured = {}

    class CapturingClient:
        async def post(self, path: str, **kwargs):
            captured["path"] = path
            captured.update(kwargs)
            return FakeGsmResponse(200, {"ok": True})

    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: CapturingClient())

    result = asyncio.run(gsm.sendToModule("+639171234567", "message"))

    assert result == {"ok": True}
    assert captured["path"] == "/sms/send"
    assert captured["headers"] == {"X-GSM-Secret": gsm.GSM_SECRET}


def test_send_sms_preserves_queue_full_status(client, session, monkeypatch):
    current_user = _authenticated_user(session, phone_verified=True)
    target = session.exec(select(User).where(User.id != current_user.id)).first()
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: SaturatedGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 503
    assert response.json() == QUEUE_FULL_RESPONSE


def test_send_sms_preserves_service_stopping_status(client, session, monkeypatch):
    current_user = _authenticated_user(session, phone_verified=True)
    target = session.exec(select(User).where(User.id != current_user.id)).first()
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: StoppingGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 503
    assert response.json() == SERVICE_STOPPING_RESPONSE


def test_phone_verification_preserves_queue_full_status(client, session, monkeypatch):
    current_user = _authenticated_user(session)
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: SaturatedGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/request",
        json={"phone_number": current_user.phone_number},
    )

    assert response.status_code == 503
    assert response.json() == QUEUE_FULL_RESPONSE


def test_phone_verification_resend_preserves_queue_full_status(
    client, session, monkeypatch
):
    current_user = _authenticated_user(session)
    session.add(
        PhoneVerification(
            user_id=current_user.id,
            phone_number=current_user.phone_number,
            verification_code="123456",
            expires_at=now_ms() + 300_000,
        )
    )
    session.commit()
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: SaturatedGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post("/gsm/resend")

    assert response.status_code == 503
    assert response.json() == QUEUE_FULL_RESPONSE


def test_contact_unknown_user_preserves_queue_full_status(client, session, monkeypatch):
    current_user = _authenticated_user(session)
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: SaturatedGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/contact-unknown-user",
        params={"target_phone_number": "+639991234567"},
    )

    assert response.status_code == 503
    assert response.json() == QUEUE_FULL_RESPONSE


def test_send_sms_reports_unavailable_gateway(client, session, monkeypatch):
    current_user = _authenticated_user(session, phone_verified=True)
    target = session.exec(select(User).where(User.id != current_user.id)).first()
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: UnavailableGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "message": "GSM gateway is unavailable",
            "reason": "GATEWAY_UNAVAILABLE",
        }
    }


def test_send_sms_preserves_modem_not_ready_status(client, session, monkeypatch):
    current_user = _authenticated_user(session, phone_verified=True)
    target = session.exec(select(User).where(User.id != current_user.id)).first()
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: ModemNotReadyGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "GSM modem not ready"}


def test_send_sms_rejects_proxy_pool_exhaustion_without_gateway_send(
    client, session, monkeypatch
):
    current_user = _authenticated_user(session, phone_verified=True)
    target = session.exec(select(User).where(User.id != current_user.id)).first()
    monkeypatch.setattr(gsm, "_get_gsm_client", lambda: PoolExhaustedGsmClient())
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "message": "GSM gateway is unavailable",
            "reason": "GATEWAY_UNAVAILABLE",
        }
    }


def test_send_sms_rejects_unverified_sender_without_gateway_send(
    client, session, monkeypatch
):
    current_user = _authenticated_user(session)
    target = session.exec(select(User).where(User.id != current_user.id)).first()

    def fail_if_gateway_client_is_requested():
        raise AssertionError("Unverified sender reached the GSM gateway")

    monkeypatch.setattr(gsm, "_get_gsm_client", fail_if_gateway_client_is_requested)
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": {
            "reason": "PHONE_VERIFICATION_REQUIRED",
            "message": "Verify your phone number before sending SMS.",
        }
    }


def test_mock_send_sms_rejects_unverified_sender(client, session, monkeypatch):
    current_user = _authenticated_user(session)
    target = session.exec(select(User).where(User.id != current_user.id)).first()
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: current_user)

    response = client.post(
        "/gsm/mock/sms/send",
        params={"user_id": str(target.id), "message": "Help is on the way"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["reason"] == "PHONE_VERIFICATION_REQUIRED"
