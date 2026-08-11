# SMS Gateway — Requirements

## Overview

The SMS gateway bridges the main server and an Arduino-based GSM module over a serial connection, letting the server send and receive SMS for OTP delivery and rescuer-initiated outreach to users without app connectivity.

---

## User Stories

| ID     | As a…    | I want to…                                              | So that…                                                        |
|--------|----------|---------------------------------------------------------|-----------------------------------------------------------------|
| SG-01  | rescuer  | send an SMS to a registered user's phone number         | I can reach them even if they are not connected to the LAN      |
| SG-02  | user     | receive a one-time password via SMS                     | I can verify my phone number or recover my account              |
| SG-03  | user     | resend an OTP if I did not receive it                   | I am not locked out due to delivery failure                     |
| SG-04  | system   | receive inbound SMS from the GSM module                 | Users can send text commands or replies back to the system      |
| SG-05  | admin    | see whether the GSM module is online                    | I can confirm SMS delivery capability before relying on it      |

---

## Functional Requirements

### FR-SG-01 — Outbound SMS

- The direct GSM route is `POST /sms/send` with `{ "number": "+639171234567", "body": "message" }`.
- One serial send is in flight at a time. At most `SMS_SEND_QUEUE_MAXSIZE` additional requests wait in FIFO order.
- Admission is non-blocking. Work beyond capacity receives HTTP 503 with `reason: "QUEUE_FULL"`, is logged as failed, and is never written to serial.
- Unsent work rejected during shutdown receives HTTP 503 with `reason: "SERVICE_STOPPING"`. An in-flight request keeps its actual modem result, `TIMEOUT`, or a reason beginning `WRITE_ERROR: `.

Queue saturation response:

```json
{
  "detail": {
    "message": "Outbound SMS queue is full",
    "reason": "QUEUE_FULL",
    "msg_id": "<sms_log UUID>"
  }
}
```

The stopping response has the same shape with `message` set to `SMS service is stopping` and `reason` set to `SERVICE_STOPPING`. These contracts apply to the direct GSM service. The main server currently does not preserve its upstream HTTP status.

### FR-SG-02 — OTP Request

- `POST /gsm/otp/request` accepts `{ phone: string, purpose: "verification" | "recovery" }`.
- The main server generates a 6-digit OTP, stores it in `phone_verification` table with a 10-minute TTL, and calls the GSM API `POST /sms/send` to deliver it.
- A phone number may request at most one OTP per 60 seconds (rate-limited by Slowapi).
- Response: `{ success: true, expires_in: 600 }`.

### FR-SG-03 — OTP Verify

- `POST /gsm/otp/verify` accepts `{ phone: string, otp: string }`.
- Looks up the most recent non-expired `phone_verification` row for the phone number.
- Returns 200 `{ verified: true }` if the OTP matches and has not expired.
- Returns 401 if the OTP is wrong.
- Returns 401 if the OTP has expired.
- Marks the row as used after a successful verification (prevents replay).

### FR-SG-04 — OTP Resend

- `POST /gsm/otp/resend` accepts `{ phone: string }`.
- Invalidates any existing OTP for that phone and generates a new one.
- Subject to the same 60-second rate limit as `/gsm/otp/request`.

### FR-SG-05 — Inbound SMS

- The Arduino receives inbound SMS from the SIM module and forwards it over serial to the GSM FastAPI service.
- The GSM FastAPI service POSTs the SMS content to the main server webhook: `POST /gsm/inbound`.
- The webhook is authenticated with a shared `GSM_SECRET` environment variable (sent as `X-GSM-Secret` header).
- A request without the correct `GSM_SECRET` is rejected with 401.
- The main server processes the inbound SMS content (e.g. parse OTP replies, store message).

### FR-SG-06 — Hardware

- GSM module: Arduino Uno (or compatible) connected to a SIM800L or SIM900 GSM shield.
- Serial interface: `/dev/ttyACM0` at 9600 baud.
- The GSM FastAPI service runs as a separate systemd unit: `server-GSM-api.service`.
- The service is co-located on the same server host as the main FastAPI application.

### FR-SG-07 — GSM Module Storage

- The GSM FastAPI service uses a local SQLite database (`sapot.db`) for state (pending outbox, delivery receipts).
- In production this is replaced by a MariaDB connection configured via the `DB_PATH` environment variable.

---

## Non-Functional Requirements

| ID       | Requirement                                                                 |
|----------|-----------------------------------------------------------------------------|
| NFR-SG-01 | `GET /health` remains responsive during outbound saturation and does not wait on a lock held across serial or other blocking I/O |
| NFR-SG-02 | OTP must expire after exactly 10 minutes                                   |
| NFR-SG-03 | Inbound webhook must respond within 5 seconds to avoid Arduino timeout     |
| NFR-SG-04 | Tests must never use a real serial port or SIM module                      |
| NFR-SG-05 | `GSM_SECRET` must be set via environment variable; never hardcoded         |

---

## Out of Scope

- MMS support.
- SMS delivery receipts from the carrier network.
- Multi-SIM failover.
- Direct SIM module management via the admin UI (v1 is send/receive only).
