# SMS Gateway: Requirements

## Overview

The SMS gateway must let SAPOT send and receive SMS through one serial-attached modem without allowing HTTP load to create an unbounded in-memory backlog.

These requirements describe the deployed `GSM-module/GSM-fastapi/` service and its HTTP integration with the main server.

## User outcomes

| ID | User | Outcome |
|---|---|---|
| SG-01 | Rescuer | Send an SMS to a registered phone number |
| SG-02 | User | Receive phone-verification and recovery codes |
| SG-03 | User | Send an SMS reply through the gateway |
| SG-04 | Administrator | Observe modem readiness and queue saturation |

## Functional requirements

### FR-SG-01: Direct outbound SMS

`POST /sms/send` accepts:

```json
{
  "number": "+639171234567",
  "body": "message"
}
```

The request must include `X-GSM-Secret` matching the required `GSM_SECRET`
configuration. Missing or invalid credentials return HTTP 401 before the
gateway creates a log row or admits work to the serial queue.

The number must use E.164 format. The submitted body must not exceed 160 characters and must remain nonempty after trimming.

A successful modem confirmation returns HTTP 200:

```json
{
  "ok": true,
  "msg_id": "<sms_log UUID>",
  "to": "+639171234567"
}
```

A modem failure, write failure, or confirmation timeout returns HTTP 502 and records the failure in `sms_log`.

### FR-SG-02: Bounded outbound admission

- One outbound request may be active in the serial sender.
- `SMS_SEND_QUEUE_MAXSIZE` permits 1 through 20 additional waiting requests and defaults to 10.
- Waiting requests retain first-in, first-out order.
- Admission must not block when the queue is full.
- Work beyond capacity must never reach the serial port.
- The pre-write timeout starts at admission, not when the request reaches the front of the queue.
- A waiting request whose caller-visible deadline expires must never be written later.
- Once a serial write starts, the caller must wait for modem confirmation or the post-write confirmation timeout instead of reporting the pre-write timeout.
- Saturated requests must be logged as failed and return HTTP 503 with `reason: "QUEUE_FULL"`.

```json
{
  "detail": {
    "message": "Outbound SMS queue is full",
    "reason": "QUEUE_FULL",
    "msg_id": "<sms_log UUID>"
  }
}
```

### FR-SG-03: Lifecycle cutoff

`SerialWorker.stop()` must close admission atomically. Waiting and active requests must resolve with `SERVICE_STOPPING`, and a new request after the cutoff must receive HTTP 503.

A request completed before the cutoff must not be overwritten. A request failed before its serial write must never be written after modem recovery.

### FR-SG-04: Health and diagnostics

- `GET /health` must remain responsive while synchronous send requests occupy worker threads.
- `GET /health` returns modem readiness and serial connection state.
- `GET /health/detailed` reports inbound queue depth, outbound waiting depth, outbound capacity, and whether a serial request is in flight.
- Queue saturation must log depth and capacity without including SMS content in the saturation warning.

### FR-SG-05: Serial protocol

The service must send and receive these frames:

```text
SEND_SMS|<number>|<body>
SMS_RECEIVED|<number>|<body>
SMS_SENT|<number>
SMS_FAILED|<number>|<reason>
GSM_READY
NETWORK_OK
NETWORK_LOST
SIM_MISSING
```

Only one request may await a modem confirmation. A confirmation received before a new request starts its serial write must not complete that request.

### FR-SG-06: Inbound SMS

- The serial reader must enqueue `SMS_RECEIVED` events for application processing.
- `handle_incoming_sms()` must apply the registered-user, banned-user, verified-phone, session, and target rules.
- Sender eligibility failures must set the inbound `sms_log` row to `rejected` with `NO_ACCOUNT`, `BANNED_SENDER`, or `UNVERIFIED_SENDER` as the failure reason.
- The GSM service must call the main server's `POST /gsm/inbound` route with `X-GSM-Secret` when forwarding into the app.
- Failed callbacks are logged. Automatic callback retry is not required.

### FR-SG-07: Configuration and storage

- `DB_PATH` is required. Startup must raise `RuntimeError` when it is missing.
- `GSM_SECRET` is required. Startup must raise `RuntimeError` when it is missing.
- Invalid `SMS_SEND_QUEUE_MAXSIZE` values must fail startup.
- `sms_log` stores inbound and outbound audit records.
- `sms_session` stores per-phone relay state.
- Before starting `SerialWorker`, startup must change every orphaned `pending` log row to `failed` with `SERVICE_CRASHED`.
- Startup reconciliation must not re-queue orphaned messages because the modem may have transmitted them before the prior process stopped.
- The committed `sapot.db` file must not be used as the deployment datastore.

### FR-SG-08: Main server integration

- The user-facing `/gsm/sms/send` route remains on the main server and requires its normal JWT authentication.
- The main server calls the direct gateway at `http://localhost:8001/sms/send` with `X-GSM-Secret`.
- The direct gateway is a trusted local service and must not be exposed to untrusted networks.
- The main server must preserve gateway HTTP 502 and 503 failures for user-facing send, verification, resend, and first-contact requests.
- The mobile app must retain rejected chat messages as `not_sent` and distinguish queue saturation from a generic delivery failure.

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-SG-01 | Memory used by outbound waiting work is bounded by the configured queue |
| NFR-SG-02 | The default 40-thread FastAPI worker pool retains headroom at maximum queue capacity |
| NFR-SG-03 | `GET /health` does not wait on serial I/O or synchronous endpoint capacity |
| NFR-SG-04 | Serial writes time out after five seconds |
| NFR-SG-05 | Automated tests never open a real serial device or contact a real modem |
| NFR-SG-06 | Production secrets are supplied through restricted environment files |

## Out of scope

- Bulk SMS and multi-modem scheduling
- Multimedia Messaging Service (MMS)
- Carrier delivery or read receipts
- Automatic retry of failed main-server callbacks
