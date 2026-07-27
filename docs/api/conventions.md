# API Conventions

Cross-cutting behavior shared by every endpoint. For any single endpoint's exact field-level request/response schema, see the relevant [`openapi/*.yaml`](openapi/) fragment (linked from each feature's `.md` file) rather than this page.

## Base URL

The server is deployed behind Nginx (TLS 1.2/1.3) as the front door; the Gunicorn/Uvicorn worker listens internally on `127.0.0.1:8000` (`server/runserver.sh`) and is not reachable directly in production. Don't hardcode a port for the externally reachable base URL — discover it from deployment config (`docs/deployment/environment-config.md`, `mobile-app/sapot-mobile-app/config/runtime.ts`).

```
https://<deployed-host>/          # production/staging (Nginx -> Gunicorn), no explicit port
http://<LAN-IP>:8000/             # local dev only, running the server directly without Nginx
```

WebSocket endpoints use `wss://` in production/staging and `ws://` in local development.

HTTP redirects to HTTPS with a 301 in production.

---

## Authentication

Most endpoints require a JWT Bearer token.

```
Authorization: Bearer <access_token>
```

Tokens are obtained from `POST /auth/token` (OAuth2 password flow). The `username` field of the form body accepts the user's **email address** — the field name is `username` for OAuth2 compliance only.

Use `POST /auth/refresh` with a refresh token to renew the access token without re-authenticating.

Role-gated endpoints require the user to hold the `rescuer` or `admin` role. Role resolution happens server-side from the JWT subject (`sub` claim = user UUID).

---

## Error Responses

### Standard HTTP error

```json
{
  "detail": "Human-readable error message"
}
```

Some endpoints return structured detail objects:

```json
{
  "detail": {
    "message": "Incorrect credentials",
    "attempts_remaining": 4
  }
}
```

### Validation error (422)

```json
{
  "detail": [
    {
      "loc": ["body", "field_name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

## Rate Limiting

Rate limiting is implemented via `slowapi`. When a rate limit is exceeded the server returns HTTP **429** with a `Retry-After` header.

Limits are keyed by **client IP** (`slowapi.util.get_remote_address`), not by user or token — so on a
LAN where many clients share one NAT egress address, they also share these budgets. Counters are
stored in Redis (`REDIS_URL`) so they're shared across Gunicorn workers; if Redis is unavailable
the limiter silently falls back to per-process in-memory counters, which under multiple workers
effectively multiplies each limit by the worker count. That fallback is acceptable for tests and
single-worker dev, not for production (`server/app/limiter.py`).

```json
{
  "detail": "Rate limit exceeded: 5 per 1 minute"
}
```

Limits are applied per-endpoint via `@limiter.limit(...)` decorators, not globally. The complete
set (every decorated route in `server/app/api/`):

| Endpoint | Limit |
|---|---|
| `POST /auth/token` | 5/minute |
| `POST /auth/` | 3/minute |
| `POST /auth/refresh` | 10/minute |
| `POST /auth/reauthenticate` | 5/minute |
| `POST /auth/change-password` | 3/minute |
| `POST /auth/forgot-password/otp/send` | 3/minute |
| `POST /auth/forgot-password/otp/verify` | 5/minute |
| `POST /auth/forgot-password/email-code` | 10/minute |
| `POST /auth/forgot-password/phone-code` | 10/minute |
| `POST /auth/forgot-password/email-recovery/send` | 3/minute |
| `GET /auth/forgot-password/email-recovery/verify` | 5/minute |
| `POST /auth/forgot-password/security-question/answer` | 10/minute |
| `POST /auth/forgot-password/recovery-with-recovery-key` | 10/minute |
| `POST /keys/register` | 3/minute |
| `POST /keys/contacts/{peer_id}` | 30/minute |
| `GET /keys/contacts` | 10/minute |
| `POST /users/wrapped-key` | 3/minute |
| `GET /users/wrapped-key` | 10/minute |
| `PUT /users/wrapped-key` | 5/minute |
| `POST /users/recovery-setup` | 3/minute |
| `GET /users/recovery-key` | 5/minute |
| `PUT /users/recovery-keys` | 5/minute |

Every other endpoint is unlimited by `slowapi`.

Login attempts are also tracked per `(user, IP)` with progressive lockout. A locked account returns 429 with:

```json
{
  "detail": {
    "locked_until": "2026-06-28T12:00:00+00:00",
    "attempts_remaining": 0
  }
}
```

---

## Pagination

Paginated endpoints use `fastapi-pagination`. Response shape:

```json
{
  "items": [],
  "total": 100,
  "page": 1,
  "size": 20,
  "pages": 5
}
```

Query params: `page` (default 1), `size` (default 20).

This envelope applies to standard REST list endpoints only. A few endpoints use a different shape for their own protocol reasons: [sync.md](sync.md) uses cursor-based pagination (`next_cursor`/`has_more`), [messaging-and-websocket.md](messaging-and-websocket.md) uses `limit`/`before`/`oldest_created_at`, and [mikrotik-telemetry.md](mikrotik-telemetry.md) returns plain `limit`-bounded arrays with no envelope. Check the endpoint's own doc before assuming this shape.

---

## Timestamps

Sync-related timestamps are **milliseconds since Unix epoch** (integer), matching WatermelonDB's format. Other timestamps are ISO 8601 strings or Unix floats depending on the endpoint.

---

## Trailing Slashes

A middleware normalizes trailing slashes. `POST /auth/` and `POST /auth` are equivalent.

---

## Static Files

Profile pictures are served at `/static/profile_pictures/<filename>` directly by Nginx (bypassing Python workers), with a 30-day cache header.

---

## WebSocket Authentication

WebSocket endpoints authenticate via a `token` query parameter (browsers cannot set custom headers on WS upgrades):

```
wss://<host>/ws/?token=<access_token>
```

The server closes the connection with code 1008 (policy violation) if the token is invalid.
