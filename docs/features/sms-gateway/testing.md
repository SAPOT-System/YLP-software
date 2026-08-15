# SMS Gateway: Testing

## Overview

The GSM FastAPI tests verify queue admission, lifecycle races, API responses, and configuration without opening a real serial port or connecting to the production database. Hardware behavior still requires a modem smoke test because unit tests cannot prove Arduino timing or carrier delivery.

## Prerequisites

Run each touched component in its pinned environment.

GSM gateway:

```bash
cd GSM-module/GSM-fastapi
nix develop
pytest
```

Main server proxy contract:

```bash
cd server
nix develop
cd app
pytest tests/test_gsm_health.py tests/test_gsm_proxy.py
```

Mobile full component gate, including GSM error handling and dependency injection wiring:

```bash
cd mobile-app
nix develop
cd sapot-mobile-app
pnpm run testAll
```

`tests/conftest.py` supplies test `DB_PATH` and `GSM_SECRET` values before importing application settings. Tests that reach API handlers replace database operations with fakes, so they do not create or mutate production records.

## What is covered?

| File | Responsibility |
|---|---|
| `tests/test_config.py` | Default queue capacity, valid range, and startup rejection |
| `tests/test_serial_worker.py` | Queue capacity, admission deadlines, lifecycle cutoff, exact-once completion, pre-write races, and serial write timeout |
| `tests/test_api_queue.py` | HTTP 503 contracts, message-log updates, diagnostics, worker-pool headroom, and health responsiveness |
| `tests/test_database_reconciliation.py` | Idempotent startup recovery of orphaned pending log rows |
| `tests/test_incoming_sms.py` | Sender rejection reason codes and inbound log status updates |
| `tests/test_lifespan.py` | Reconciliation ordering before serial worker startup |
| `server/app/tests/test_gsm_proxy.py` | Main-server shared-secret header, status preservation, and timeout headroom for chat, verification, resend, and first-contact requests |
| `mobile-app/sapot-mobile-app/features/shared/core/errors/__tests__/gsm-error.test.ts` | Typed `QUEUE_FULL` parsing and user-visible error messages |
| `mobile-app/sapot-mobile-app/features/chat/components/__tests__/message-list.test.tsx` | Manual resend rejection and `not_sent` restoration |
| `mobile-app/sapot-mobile-app/features/auth/auth-container.test.ts` | Phone-verification service construction |
| `mobile-app/sapot-mobile-app/features/shared/__tests__/main-container-initialize.test.ts` | GSM service construction within the runtime container |

## How is serial I/O isolated?

Most worker tests do not start the reader or sender threads. Tests that need a serial write assign a small fake object to `worker._ser`. The connection test replaces `serial_worker.serial.Serial` before calling `_connect_and_read()`.

No test may rely on `/dev/ttyACM0`, a SIM card, or a carrier network. A test that starts a thread must signal it to stop and join it before returning.

## Queue and lifecycle cases

| Scenario | Expected result |
|---|---|
| Waiting queue reaches configured capacity | Next admission raises `OutboundQueueFullError` without a serial write |
| Capacity is outside 1 through 20 | Configuration or worker construction fails |
| Shutdown begins with waiting work | Waiting requests complete with `SERVICE_STOPPING` |
| Shutdown begins with active work | Active request completes with `SERVICE_STOPPING` |
| Network loss completes active work before writing | Recovery does not write the failed request |
| Caller deadline expires while a request is queued | The request returns `CLIENT_TIMEOUT` and is never written |
| Serial write crosses the admission deadline | The caller waits for modem confirmation instead of returning the pre-write timeout |
| Stale confirmation arrives before a new write | New request remains pending and is written normally |
| Two completions race for one request | First completion wins |
| Serial connection opens | PySerial receives the configured five-second write timeout |

## API saturation cases

The saturation test starts 21 blocking send requests, representing 20 waiting requests plus one active request. It then verifies that:

1. A further `POST /sms/send` reaches the handler and returns HTTP 503 with `QUEUE_FULL`.
2. `GET /health` returns while those sends remain blocked.
3. Releasing the admitted requests lets every pending HTTP request complete.

This covers the thread-pool exhaustion described by issue #252. A test with only a rejecting fake would verify the response shape but would not prove that the rejection handler can still obtain a worker thread.

## Manual modem smoke test

Run this only on a host with the configured Arduino and SIM:

1. Set `DB_PATH`, `GSM_SECRET`, `SERIAL_PORT`, and `SMS_SEND_QUEUE_MAXSIZE` in the host environment file.
2. Start the GSM service and wait for `GSM_READY`.
3. Check liveness:

   ```bash
   curl http://127.0.0.1:8001/health
   ```

4. Send one SMS to a controlled test number:

   ```bash
   curl -X POST http://127.0.0.1:8001/sms/send \
     -H 'Content-Type: application/json' \
     -H 'X-GSM-Secret: <value from GSM_SECRET>' \
     -d '{"number":"+639171234567","body":"SAPOT GSM smoke test"}'
   ```

5. Confirm the API response, `sms_log` status, Arduino event, and receipt on the test phone.

## Limitations

- Automated tests do not prove USB permissions, modem readiness, SIM balance, signal quality, or carrier delivery.
- API tests mock message-log persistence; they do not validate the MariaDB schema.
- Real-hardware testing must use a controlled phone number and must not run in shared CI.
