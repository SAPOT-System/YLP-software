# GSM / SMS API

Machine-readable spec: [`openapi/gsm-sms.yaml`](openapi/gsm-sms.yaml) (generated from the live FastAPI app).

The GSM endpoints proxy SMS operations from the SAPOT server to the GSM module (router in `server/app/api/gsm.py`, prefix `/gsm`). The GSM module controls an Arduino/serial modem using AT commands. `/gsm/mock/*` are hardware-free mock variants of the same routes, for testing without a GSM modem attached — same request/response shapes, prefixed `mock/`.

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/gsm/users/by-phone/{phone}` | JWT Bearer | Look up a registered user by phone number. |
| POST | `/gsm/inbound` | Shared-secret header (`_gsm_secret_ok`) | Webhook — receive an inbound SMS from the GSM hardware gateway. |
| GET | `/gsm/health` | JWT Bearer | Check GSM module availability. |
| GET | `/gsm/health/detailed` | JWT Bearer | Detailed GSM module health/diagnostics. |
| GET | `/gsm/sms/messages` | JWT Bearer | List recent SMS messages seen by the module. |
| POST | `/gsm/sms/send` | JWT Bearer + verified phone | Send an SMS to a phone number. |
| POST | `/gsm/request` | None | Initiate an SMS OTP for a phone number (registration/verification). |
| POST | `/gsm/verify` | None | Verify an SMS OTP code. |
| POST | `/gsm/resend` | None | Resend an SMS OTP. |
| GET | `/gsm/phone-is-verified` | JWT Bearer | Check whether the current user's phone number is verified. |
| POST | `/gsm/migrate-phone-user` | JWT Bearer | Migrate a guest user's data onto a phone-registered account. |
| POST | `/gsm/contact-unknown-user` | JWT Bearer | Send an onboarding SMS to a phone number not yet registered. |
| GET | `/gsm/mock/health` | JWT Bearer | Mock variant of `/gsm/health`. |
| GET | `/gsm/mock/health/detailed` | JWT Bearer | Mock variant of `/gsm/health/detailed`. |
| GET | `/gsm/mock/sms/messages` | JWT Bearer | Mock variant of `/gsm/sms/messages`. |
| POST | `/gsm/mock/sms/send` | JWT Bearer + verified phone | Mock variant of `/gsm/sms/send`. |
| POST | `/gsm/mock/request` | None | Mock variant of `/gsm/request`. |
| POST | `/gsm/mock/verify` | None | Mock variant of `/gsm/verify`. |
| POST | `/gsm/mock/resend` | None | Mock variant of `/gsm/resend`. |
| GET | `/gsm/mock/phone-is-verified` | JWT Bearer | Mock variant of `/gsm/phone-is-verified`. |
| POST | `/gsm/mock/migrate-phone-user` | JWT Bearer | Mock variant of `/gsm/migrate-phone-user`. |
| POST | `/gsm/mock/contact-unknown-user` | JWT Bearer | Mock variant of `/gsm/contact-unknown-user`. |

---

## POST /gsm/inbound

Webhook endpoint the GSM hardware gateway calls when it receives an SMS. Protected by a shared secret check (`GSM_SECRET` env var), not JWT auth.

---

The GSM module's own standalone hardware-facing API is documented in [`docs/deployment/gsm-module.md`](../deployment/gsm-module.md). Its `POST /sms/send` route requires the same `X-GSM-Secret` shared secret that protects the main server's inbound webhook.

## Outbound sender eligibility

`POST /gsm/sms/send` and its mock variant require a `PhoneVerified` record for the authenticated account. The server checks this before looking up the recipient or contacting the GSM gateway. An unverified account receives HTTP 403:

```json
{
  "detail": {
    "reason": "PHONE_VERIFICATION_REQUIRED",
    "message": "Verify your phone number before sending SMS."
  }
}
```

## Gateway failure contract

The main server preserves synchronous gateway failures for `/gsm/sms/send`, `/gsm/request`, `/gsm/resend`, and `/gsm/contact-unknown-user`. Queue saturation returns HTTP 503:

```json
{
  "detail": {
    "message": "Outbound SMS queue is full",
    "reason": "QUEUE_FULL",
    "msg_id": "<sms_log UUID>"
  }
}
```

An unreachable gateway also returns HTTP 503 with `reason: "GATEWAY_UNAVAILABLE"`. Clients should keep rejected messages available for manual retry and should not report verification or onboarding SMS as sent.

See [gsm-sms.yaml](openapi/gsm-sms.yaml) for exact field-level request/response schemas, or the live server's `/docs` / `/openapi.json`.
