# SAPOT Server API

SAPOT is a disaster/emergency-response LAN communication platform. The server is built with FastAPI/Python and exposes a REST and WebSocket API consumed by the SAPOT mobile application.

## Base URL

See [conventions.md](conventions.md#base-url) for how to discover the base URL — don't hardcode a port; production/staging traffic goes through nginx with no explicit port, while local dev (server run directly) defaults to `:8000`.

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

Three role levels are distinguishable from a JWT:

| Level | Description |
|---|---|
| Authenticated (`user`) | Any registered user with a valid JWT |
| Rescuer | A user who has been granted the rescuer role by an admin |
| Admin | A user who has been granted the admin role |

These are exactly what the server's `_resolve_role` helper
(`server/app/db_operations/user_search.py`) returns: `admin` if the user has an `admin` row,
else `rescuer` if they have a `rescuer` row, else `user`.

A fourth role, **`guest`**, exists in the platform's role model (ADR
[0006](../adr/0006-four-tier-roles-model.md)) but is *not* returned by `_resolve_role` and does
not authenticate against this API. Guest records (`guest` table) are placeholder users created
server-side — by `POST /sync/push` when a pushed payload references an unknown peer ID, and by
the GSM phone-onboarding flow. They have no usable password, so they never hold a JWT. To ask
whether a given peer is a guest, use `GET /keys/{peer_id}/type`, which reports whether that peer
has a server-registered `PeerKey`.

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
| [admin.md](admin.md) | All `GET /api/admin/*`, `POST /api/admin/*`, `PATCH /api/admin/*`, `DELETE /api/admin/*` endpoints — user management, banning, roles, announcements, activity logs, network stats |
| [gsm-sms.md](gsm-sms.md) | `/gsm/sms/send`, `/gsm/request`, `/gsm/verify`, `/gsm/resend`, `/gsm/contact-unknown-user`, `/gsm/migrate-phone-user`, internal inbound/health endpoints, mock variants |
| [captive-portal.md](captive-portal.md) | `/portal/api/v1/guests/*` — MikroTik hotspot guest session tracking |
| [mikrotik-telemetry.md](mikrotik-telemetry.md) | `/api/admin/router/health/*`, `/api/admin/router/traffic/{interface}`, `/api/admin/router/dashboard` |
| [profile.md](profile.md) | `GET /profile-picture/me`, `POST /profile-picture/me`, `GET /profile-picture/{user_id}` |
| [system.yaml](openapi/system.yaml) | `GET /`, `GET /version`, `GET /ping`, `GET /static/*`, `GET /download/download-apk`, `POST /testing/test-make-admin`, `POST /testing/test-make-rescuer`, `POST /update/profile/`, `/user-utils/*` — see [Other Endpoints](#other-endpoints) below |

## Other Endpoints

Grouped in [`openapi/system.yaml`](openapi/system.yaml); no dedicated `.md` file exists for these yet.

| Path | Method | Auth | Description |
|---|---|---|---|
| `/` | GET | None | Returns `{"state": "running"}` |
| `/version` | GET | None | Returns server version string |
| `/ping` | GET | Any | Returns `{"status": "ok", "timestamp": <unix float>}` — use for latency measurement |
| `/static/*` | GET | None | Static file serving (profile pictures, downloads) |
| `/download/download-apk` | GET | None | Serves the current mobile app APK build |
| `/testing/test-make-admin` | POST | Authenticated + `X-QA-Token` | Dev/testing only; grants the admin role to `username` |
| `/testing/test-make-rescuer` | POST | Authenticated + `X-QA-Token` | Dev/testing only; grants the rescuer role to `username` |
| `/update/profile/` | POST | Any | Updates the calling user's own profile fields |
| `/user-utils/current-user-info` | GET | Any | Returns the calling user's own `UserInfo` |
| `/user-utils/get-announcements` | GET | Any | Paginated announcements targeted at the calling user |
| `/user-utils/is-admin` | GET | Any | Returns whether the calling user holds the admin role |
| `/user-utils/is-rescuer` | GET | Any | Returns whether the calling user holds the rescuer role |
| `/user-utils/search-user` | POST | Any | Search users by identifier string |
| `/user-utils/search-user/{id}` | GET | Any | Look up a user by ID |
