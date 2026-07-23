# Captive Portal API

Machine-readable spec: [`openapi/captive-portal.yaml`](openapi/captive-portal.yaml) (generated from the live FastAPI app).

The captive portal endpoints handle guest session tracking for the MikroTik hotspot login flow (router in `server/app/api/captive_portal.py`, prefix `/portal`). They are separate from the main user authentication system — `GuestSession` is not linked to the `User` table.

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/portal/api/v1/guests` | None (internal — called from the MikroTik-hosted static portal page) | Record a new guest login. Idempotent on `session_id` (returns the existing record instead of erroring on double-submit). |
| GET | `/portal/api/v1/guests` | None (internal) | List all guest sessions. Filterable by `status` (`active`/`disconnected`), `search` (name substring), with `limit`/`offset` pagination. |
| GET | `/portal/api/v1/guests/stats` | None (internal) | Aggregate session counts: total, active, disconnected. |
| GET | `/portal/api/v1/guests/&lbrace;session_id&rbrace;` | None (internal) | Retrieve a single guest session by its client-generated `session_id`. |
| PATCH | `/portal/api/v1/guests/&lbrace;session_id&rbrace;/disconnect` | None (internal) | Mark a session as disconnected (sets `status=disconnected`, `disconnect_at=now`). Intended to be idempotent. |

---

## POST /portal/api/v1/guests

Idempotent on `session_id` — a double-submit returns the existing record rather than erroring. `GuestLoginRequest`/`GuestSessionRead` field schemas are in [`openapi/captive-portal.yaml`](openapi/captive-portal.yaml).

---

## PATCH /portal/api/v1/guests/&lbrace;session_id&rbrace;/disconnect

Called by the portal's logout page when the guest clicks Disconnect.

> **Known issue:** as of this writing, `disconnect_guest_session` in `server/app/api/captive_portal.py` references an undefined `db` variable instead of the injected `session` dependency — this endpoint will raise a `NameError` at runtime. Flagged here for visibility; `server/` is read-only reference and not fixed by this doc update.

---

See [captive-portal.yaml](openapi/captive-portal.yaml) for exact field-level request/response schemas (`GuestSessionRead`, `GuestLoginRequest`, `StatsResponse`, `GuestListResponse`, `SessionStatus`), or the live server's `/docs` / `/openapi.json`.
