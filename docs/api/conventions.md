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

```json
{
  "detail": "Rate limit exceeded: 5 per 1 minute"
}
```

Per-endpoint limits:

| Endpoint | Limit |
|---|---|
| `POST /auth/token` | 5/minute |
| `POST /auth/` | 3/minute |
| `POST /auth/refresh` | 10/minute |
| `POST /auth/reauthenticate` | 5/minute |
| `POST /auth/change-password` | 3/minute |

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
