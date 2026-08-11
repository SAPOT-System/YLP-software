# CLAUDE.md — GSM-module

Instructions for Claude Code working in `GSM-module/` — SAPOT's SMS gateway, bridging the main server to a physical GSM modem so SMS can be sent/received when LAN messaging is unavailable. See root `../CLAUDE.md` for repo-wide rules.

## Project Overview

Three layers: Arduino firmware talking AT commands to a SIM800L/SIM900 modem over serial; a Python (FastAPI) service on the same machine talking to the Arduino over USB serial; the main `server/` proxying outbound calls over trusted HTTP and authenticating inbound callbacks with a shared secret. There are **two parallel Python implementations** in this directory; they are not both live (see Architecture).

## Architecture — which implementation is live

**`GSM-fastapi/` is the deployed, current implementation.** Evidence: `docs/deployment/gsm-module.md`, `docs/getting-started/gsm-module-setup.md`, and `docs/features/sms-gateway/README.md` all reference only `GSM-fastapi/`; `server/app/api/gsm.py` proxies to `http://localhost:8001`, and `GSM-fastapi/main.py` hardcodes `uvicorn.run("api:app", port=8001, ...)`, an exact match.

**`GSM-API/` is a separate, incomplete rewrite that is not deployed or referenced by `server/`.** It has in-memory-only session state (no DB persistence), fire-and-forget SMS sends (no delivery confirmation), and an unsynchronized global (`app/gsm/gsm_runtime.py`'s module-level `ser`) shared across threads with no lock. Default to editing `GSM-fastapi/` for SMS-gateway work; only touch `GSM-API/` if a task explicitly asks for it.

**Documentation source of truth:** `docs/features/sms-gateway/design.md` describes the deployed HTTP routes, queue, lifecycle, and serial flow. Use `GSM-fastapi/protocol.py` and the Arduino firmware as the authoritative definitions for individual serial frames.

### Data flow (GSM-fastapi, the live path)

**Inbound:** Arduino emits `SMS_RECEIVED|<num>|<body>` over serial → `serial_worker.py`'s `SerialWorker._reader_loop` parses it via `protocol.py` → queued → `api.py`'s async `_inbox_drain()` task offloads to a thread pool → `sms_handler.handle_incoming_sms()` (session/target flow, ban/verified checks against MariaDB) → `database.py`'s `notify_app()` POSTs to the main server's `/gsm/inbound` with an `X-GSM-Secret` header.

**Outbound:** the main server calls `POST /sms/send` on port 8001. `SerialWorker.send_sms()` atomically admits the request to a bounded FIFO queue or rejects saturation with HTTP 503. The sender writes `SEND_SMS|<num>|<body>`, and the reader resolves the request from `SMS_SENT|` or `SMS_FAILED|`. The admin GSM page reads health and message history through the main server. Shutdown rejects queued and active work with `SERVICE_STOPPING`.

`SerialWorker` runs two dedicated threads (`_reader_loop`, `_sender_loop`) with proper request/response correlation over the async serial stream, and auto-reconnects every 10s on disconnect.

## Directory Guide

- `GSM-fastapi/` — **live service.** `main.py` (entry, hardcoded port 8001), `api.py` (FastAPI app + lifespan: starts `SerialWorker`, `_inbox_drain` task), `serial_worker.py` (reader/sender thread engine — read this before any serial-related change), `protocol.py` (wire format), `sms_handler.py` (session/target business logic), `database.py` (SQLAlchemy models + `notify_app()` webhook), `config.py` (env settings), `models/` (separate SQLModel-style definitions — check for drift against the SQLAlchemy models in `database.py` before editing schema).
- `GSM-API/` — parallel WIP/duplicate implementation, not deployed. See Architecture.
- `GSM-arduino-actual-code/GSM-arduino-actual-code.ino` — production firmware; the authoritative definition of the wire protocol both Python services implement.
- `GSM-trial-code/GSM-trial-code.ino` — a manual SIM800L bring-up/debug tool with human-readable diagnostic output, **not** the `SEND_SMS|`/`SMS_RECEIVED|` protocol — not compatible with either Python service. Do not treat it as an alternate firmware target.

## Key Concepts

- **Wire protocol** — pipe-delimited lines: `SEND_SMS|<num>|<body>` (PC → Arduino), `SMS_RECEIVED|<num>|<body>`, `SMS_SENT|<num>`, `SMS_FAILED|<num>|<reason>`, `GSM_READY`, `NETWORK_OK`/`NETWORK_LOST`, `SIM_MISSING` (Arduino → PC). Implemented identically in `GSM-fastapi/protocol.py`. Any change to this format must be mirrored in the `.ino` firmware's parser/emitter — they are independent implementations of the same contract, not shared code.
- **Session/target flow** — inbound SMS starts a session (`NEW`), the sender texts `[target] +63...` to select a recipient (`AWAITING_TARGET` → `ACTIVE`), then messages relay through. `GSM-fastapi` persists this to MariaDB (`SmsSession` table) and checks `banned`/`phone_is_verified` on both sender and target; `GSM-API`'s equivalent is in-memory only and skips those checks.
- **Shared-secret webhook auth** (`X-GSM-Secret` header) — how this service calls back into the main server (`/gsm/inbound`); distinct from the JWT auth used elsewhere in SAPOT (see `../server/CLAUDE.md`).

## Development Conventions

- Default to `GSM-fastapi/` for SMS-gateway changes; don't dual-maintain `GSM-API/` unless a task is explicitly about reviving it.
- Protocol changes touch three places in lockstep: `GSM-fastapi/protocol.py`, the Arduino `.ino` firmware, and (only if reviving it) `GSM-API/app/gsm/protocol.py`.
- `GSM-fastapi/database.py`'s SQLAlchemy models (`User`, `Conversation`, `Message`, `BannedUser`, `PhoneVerified`) mirror tables owned by the main `server/` — coordinate schema changes with `../server/CLAUDE.md`, don't change them independently here.

## Important Files

- `GSM-fastapi/serial_worker.py` — the reader/sender thread engine; read before touching anything serial-related.
- `GSM-fastapi/protocol.py` — wire format, must match the Arduino firmware exactly.
- `GSM-fastapi/sms_handler.py` — session/target/ban/verification business logic.
- `GSM-arduino-actual-code/GSM-arduino-actual-code.ino` — authoritative protocol definition (AT-command sequence, SMS send/receive framing).

## Common Pitfalls

- `main.py` hardcodes port `8001` while `config.py`'s `Settings.port` defaults to `8000` — the `PORT` env var does not actually control the bound port; don't assume changing it works without checking `main.py`.
- `GSM-fastapi/requirements.txt` contains entries unrelated to this service (`RouterOS-api`, `sentry-sdk`, `pythonping`), apparently copied from the main server's requirements — don't assume every listed dependency is actually used here.
- `GSM-fastapi/sapot.db` is a stale, unused artifact (confirmed in `../docs/database/migrations.md`) — real storage is MariaDB via `config.py`'s `DB_PATH`. Never read from or write to `sapot.db`.
- `GSM-API/app/gsm/gsm_runtime.py`'s module-level `ser` is a global shared across threads with no lock — if `GSM-API` is ever revived, this is a live race condition, not a style nit.
- `GSM-trial-code.ino` is not wire-compatible with either Python service — never point a deployment at it, even for "quick testing."
- `server/app/api/gsm.py`'s own code comments refer to "GSM-API" as a generic name for **the GSM service it proxies to** (i.e. the live `GSM-fastapi/`, port 8001) — not the literal `GSM-module/GSM-API/` directory documented above as non-deployed. Don't let those comments override the Architecture section above.

## When Modifying This Project

- Wire-protocol changes require updating `GSM-fastapi/protocol.py` and the Arduino firmware together — test against real hardware or a serial-loopback harness, not just unit tests of one side.
- Schema changes to `GSM-fastapi/database.py` that touch shared tables (`User`, `BannedUser`, `PhoneVerified`) need coordination with `../server/CLAUDE.md` since the main server owns those tables.
- Before testing, verify `SERIAL_PORT`/baud against actual hardware (`GSM-fastapi` default `/dev/ttyACM0`) — a wrong port fails silently, the reader loop just keeps retrying every 10s without a clear error.
