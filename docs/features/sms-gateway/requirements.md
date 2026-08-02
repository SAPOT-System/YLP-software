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

- `POST /gsm/send` accepts `{ phone: string, message: string }`.
- Requires a valid user or admin JWT (rescuer role for sending arbitrary SMS; system for OTP).
- The GSM API forwards the message to the Arduino over the serial port (`/dev/ttyACM0`).
- The Arduino commands the SIM800L / SIM900 module to send the SMS.
- Response: `{ success: true, message_id: string }` on success; error detail on failure.

### FR-SG-02 — OTP Request

- `POST /gsm/otp/request` accepts `{ phone: string, purpose: "verification" | "recovery" }`.
- The main server generates a 6-digit OTP, stores it in `phone_verification` table with a 10-minute TTL, and calls the GSM API `POST /gsm/send` to deliver it.
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
| NFR-SG-01 | SMS delivery attempt must complete or fail within 30 seconds               |
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
