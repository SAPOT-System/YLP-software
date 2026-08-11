# SMS Gateway — Testing

## Strategy

The current implementation has focused automated tests under `GSM-module/GSM-fastapi/tests/`. They mock serial I/O and database calls and must never open a real serial device.

| Layer       | Tooling                          | Scope                                                              |
|-------------|----------------------------------|--------------------------------------------------------------------|
| Unit        | pytest                           | `protocol.py` encode/decode, `sms_handler` outbound/inbound logic |
| Integration | pytest + HTTPX + in-memory SQLite| GSM FastAPI endpoints, main server OTP endpoints, webhook handler  |
| Hardware    | **Never tested against real HW** | Serial port and SIM module are always mocked                       |

---

## Coverage Targets

| Area                              | Target |
|-----------------------------------|--------|
| `protocol.py` encode/decode       | 100%   |
| `sms_handler` outbound path       | 100%   |
| `sms_handler` inbound path        | 100%   |
| OTP request / verify / resend     | 100%   |
| Webhook authentication            | 100%   |
| Rate limiting enforcement         | 90%+   |
| Overall SMS gateway coverage      | ≥ 80%  |

---

## Mocking Rules

- **Serial port** — mock `serial_worker.serial_send`; never open a real `/dev/ttyACM0`. Use `unittest.mock.patch`.
- **GSM API HTTP calls** — mock `requests.post` in `sms_handler.handle_inbound`; never hit the real main server.
- **Main server → GSM API calls** — mock the GSM API `POST /sms/send` with `respx` or `responses`; never hit the real GSM service.
- **Database** — use in-memory SQLite for both the GSM service (`sapot.db`) and main server tests.
- **Time** — use `freezegun` for OTP expiry assertions.
- **GSM_SECRET** — set via `os.environ` in fixture setup; use a fixed test value `"test-gsm-secret-value"`.
- **OTP generation** — mock `generate_otp` to return a fixed value (`"123456"`) in integration tests for predictable assertions.

---

## Test Cases

### Outbound queue and shutdown

| Scenario | Expected result |
|---|---|
| Capacity is reached | The next request fails immediately with `QUEUE_FULL` and no serial write |
| Shutdown drains waiting work | Unsent requests resolve as `SERVICE_STOPPING`; the in-flight request keeps its actual result |
| Modem event races timeout | Completion occurs once and late events are ignored |
| Serial write stalls | The finite write timeout produces a reason beginning `WRITE_ERROR: ` |
| Saturated service health check | `/health` remains responsive and detailed health reports outbound depth, capacity, and in-flight state |

### `protocol.py` — Unit

| Scenario | Expected result |
|----------|-----------------|
| `build_send_sms("+639171234567", "hello")` | Returns `"SEND_SMS|+639171234567|hello\n"` |
| `decode("RECV:+639171234567:test message\n")` | Returns frame with `type="RECV"`, `from_number="+639171234567"`, `message_body="test message"` |
| `parse_line("SMS_SENT|+639171234567\n")` | Returns an `SMS_SENT` event |
| `decode("ERR:101:module timeout\n")` | Returns frame with `type="ERR"`, `code="101"`, `detail="module timeout"` |
| `decode("INVALID\n")` | Raises `ProtocolError` |
| Message body containing colon character | Encoded and decoded without truncation |

### GSM Service — `POST /sms/send` (Integration)

| Scenario | Expected result |
|----------|-----------------|
| Valid `{ phone, message }` payload | `serial_worker.serial_send` called with correct encoded frame; row inserted in `sms_outbox` with status `pending`; response `{ success: true, message_id }` |
| Arduino ACK received via serial | `sms_outbox` row updated to `delivered` |
| Arduino ERR received via serial | `sms_outbox` row updated to `failed` with error detail |
| Serial port unavailable at startup | Service returns 503 on `/sms/send`; error logged |
| Missing `phone` field | Returns 422 |
| `message` exceeds 160 characters | Returns 400 or splits into multiple frames depending on config |

### Main Server — OTP Request (Integration)

| Scenario | Expected result |
|----------|-----------------|
| `POST /gsm/otp/request` with valid phone, purpose `"verification"` | `phone_verification` row created with hashed OTP; `expires_at = now + 10 min`; GSM API send called |
| Second request within 60 s for same phone | Returns 429 (rate limit) |
| Request after 60 s | New OTP generated; old row marked superseded |
| GSM API send fails | Returns 503; `phone_verification` row not created |
| Missing `phone` field | Returns 422 |

### Main Server — OTP Verify (Integration)

| Scenario | Expected result |
|----------|-----------------|
| Correct OTP within expiry window | Returns 200 `{ verified: true }`; `phone_verification.used` set to `true` |
| Correct OTP reused after first verify | Returns 401 (row is marked `used`) |
| Wrong OTP | Returns 401 |
| OTP expired (`expires_at` in past) | Returns 401 |
| No OTP row exists for phone | Returns 401 |
| `POST /gsm/otp/verify` 6 times in 60 s | 6th request returns 429 (rate limit) |

### Main Server — OTP Resend (Integration)

| Scenario | Expected result |
|----------|-----------------|
| `POST /gsm/otp/resend` for phone with existing OTP | Old row invalidated; new `phone_verification` row created; GSM API send called with new OTP |
| Resend within 60 s of last request | Returns 429 |

### Inbound Webhook — Main Server (Integration)

| Scenario | Expected result |
|----------|-----------------|
| `POST /gsm/inbound` with correct `X-GSM-Secret` | Returns 200; inbound SMS processed |
| `POST /gsm/inbound` with wrong secret | Returns 401; SMS not processed |
| `POST /gsm/inbound` with missing `X-GSM-Secret` header | Returns 401 |
| `POST /gsm/inbound` with valid secret and OTP-reply body | OTP reply matched to pending verification; user notified |

### GSM Service — Inbound SMS Path (Unit)

| Scenario | Expected result |
|----------|-----------------|
| `handle_inbound("RECV:+639171234567:hello\n")` | `requests.post` called to main server `/gsm/inbound` with correct payload and `X-GSM-Secret` header |
| Main server webhook call times out | Error logged; no retry in v1; service continues |
| `SMS_SENT|+639171234567` | Resolves the one in-flight request; the waiting sender persists the final result |
| `handle_inbound("ERR:101:timeout\n")` | Matching outbox row updated to `failed` |
| Serial line that does not parse | `ProtocolError` caught; error logged; service continues |

---

## Test File Locations

- `tests/test_config.py`: queue-capacity defaults and invalid settings.
- `tests/test_serial_worker.py`: capacity, lifecycle cutoff, exact-once completion, shutdown draining, and serial write timeout.
- `tests/test_api_queue.py`: 503 queue and shutdown contracts plus saturation diagnostics.

```
GSM-module/GSM-fastapi/
  tests/
    test_config.py
    test_serial_worker.py
    test_api_queue.py

server/
  tests/
    test_gsm_otp.py
    test_gsm_inbound_webhook.py
```

## Important: No Real Hardware in CI

All CI runs must set:
```
MOCK_SERIAL=true
GSM_SECRET=test-gsm-secret-value
DB_PATH=:memory:
```

Any test that attempts to open `/dev/ttyACM0` or make an outbound HTTP call to a non-mocked host must fail the test suite with a clear error message.
