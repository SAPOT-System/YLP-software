# SAPOT Server API

SAPOT is a disaster/emergency-response LAN communication platform. The server is built with FastAPI/Python and exposes a REST and WebSocket API consumed by the SAPOT mobile application.

## Base URL

Do not hardcode a port. The server process (`gunicorn` + `uvicorn` workers, see `server/runserver.sh`) binds to `127.0.0.1:8000` on the host, but production and staging traffic goes through nginx as the front door — the externally reachable base URL has no explicit port (`https://sapot.online`, matching the mobile app's `config/runtime.ts` EAS-channel resolution). Always discover the base URL from deployment config (`docs/deployment/environment-config.md`, `mobile-app/sapot-mobile-app/config/runtime.ts`) rather than assuming a port.

**Local dev only:** when running the server directly (not behind nginx) on your own machine, it listens on port `8000` by default — e.g. `http://<LAN-IP>:8000` — but this is a local-dev convenience, not an assumption other environments share.

WebSocket connections use the `ws://`/`wss://` scheme on the same host (and, for local dev only, the same port).

## Always-Accurate Reference

The hand-written docs in this directory (and the committed YAML fragments in [`openapi/`](openapi/)) can drift from the server. For the ground truth, use a running server's built-in OpenAPI surface:

- `GET /docs` — interactive Swagger UI
- `GET /redoc` — ReDoc UI
- `GET /openapi.json` — the full machine-readable spec

The `openapi/*.yaml` fragments in this directory are generated snapshots of that same spec, split by feature, for offline reading and diffing — regenerate them (`app.openapi()` in `server/app/main.py`) whenever routes change.

## Versioning

The server version string is not stable and should never be hardcoded in docs — it's sourced from `__version__` in `server/app/version.py` and bumped per release (see root `VERSIONING.md`). Get the current value at runtime:

```
GET /version
```

```json
{ "version": "<current __version__, e.g. 0.0.2-beta.1>" }
```

Every `openapi/*.yaml` fragment's `info.version` is generated from this same `__version__` value, so it always matches what `GET /version` returns for the deployed build.

## Authentication Overview

Most endpoints require a JWT Bearer token obtained from `POST /auth/token`.

```
Authorization: Bearer <access_token>
```

Tokens expire. Use `POST /auth/refresh` with a refresh token to obtain a new pair.

Three role levels exist:

| Level | Description |
|---|---|
| Authenticated | Any registered user with a valid JWT |
| Rescuer | A user who has been granted the rescuer role by an admin |
| Admin | A user who has been granted the admin role |

See [authentication.md](authentication.md) for the full token flow.

## Rate Limiting

Endpoints are rate-limited via `slowapi`. When a limit is exceeded the server returns HTTP 429. See [conventions.md](conventions.md) for the error shape and `Retry-After` header behaviour.

## API Groups

Each `.md` file below links to a corresponding machine-readable OpenAPI fragment under [`openapi/`](openapi/), generated from the live server spec.

| File | Endpoints |
|---|---|
| [conventions.md](conventions.md) | Response envelope, error shapes, pagination, rate limiting |
| [authentication.md](authentication.md) | `POST /auth/token`, `POST /auth/`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/exists`, `POST /auth/change-password`, `POST /auth/reauthenticate`, `GET /auth/terms` |
| [auth-and-recovery.md](auth-and-recovery.md) | All `POST /auth/forgot-password/*` and `GET /auth/forgot-password/*` endpoints — email OTP, phone OTP, recovery key file, security questions, email magic link |
| [keys-and-encryption.md](keys-and-encryption.md) | `POST /keys/register`, `GET /keys/server-public-key`, `/keys/contacts/*`, `/keys/{peer_id}`, `/users/wrapped-key`, `/users/recovery-setup`, `/users/recovery-key`, `/users/recovery-keys` |
| [sync.md](sync.md) | `GET /sync/pull`, `POST /sync/push` — WatermelonDB sync protocol |
| [messaging-and-websocket.md](messaging-and-websocket.md) | `WebSocket /ws/` — chat, signalling, presence, public chat; `GET /public-chat` |
| [gps.md](gps.md) | `WebSocket /gps/ws/{user_id}`, `WebSocket /gps/ws/monitor/rescuers/{rescuer_id}`, `GET /gps/latest`, `GET /gps/history/{user_id}` |
| [admin.md](admin.md) | All `GET /admin/*`, `POST /admin/*`, `PATCH /admin/*`, `DELETE /admin/*` endpoints — user management, banning, roles, announcements, activity logs, network stats |
| [gsm-sms.md](gsm-sms.md) | `/gsm/sms/send`, `/gsm/request`, `/gsm/verify`, `/gsm/resend`, `/gsm/contact-unknown-user`, `/gsm/migrate-phone-user`, internal inbound/health endpoints, mock variants |
| [captive-portal.md](captive-portal.md) | `/portal/api/v1/guests/*` — MikroTik hotspot guest session tracking |
| [mikrotik-telemetry.md](mikrotik-telemetry.md) | `/admin/router/health/*`, `/admin/router/traffic/{interface}`, `/admin/router/dashboard` |
| [system.yaml](openapi/system.yaml) | `GET /`, `GET /version`, `GET /ping`, `GET /static/*` — see [Other Endpoints](#other-endpoints) below |

## Other Endpoints

| Path | Method | Description |
|---|---|---|
| `/` | GET | Returns `{"state": "running"}` |
| `/version` | GET | Returns server version string |
| `/ping` | GET | Returns `{"status": "ok", "timestamp": <unix float>}` — use for latency measurement |
| `/static/*` | GET | Static file serving (profile pictures, downloads) |
