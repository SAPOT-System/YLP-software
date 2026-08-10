# Authentication API

Machine-readable spec: [`openapi/authentication.yaml`](openapi/authentication.yaml) (generated from the live FastAPI app — includes both `auth.router` and `verify_email.router`). See it for exact request/response field schemas, types, and constraints (e.g. username/password length limits, email/phone format).

All auth endpoints are under the `/auth` prefix. Account email verification (`/auth/verify/*`, `server/app/api/verify_email.py`) is documented here too since it shares the prefix and login flow.

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/auth/` | None | Health check for the auth router. |
| POST | `/auth/` | None (rate-limited 3/min) | Create a new user account. |
| POST | `/auth/token` | None (rate-limited 5/min) | Log in and obtain an access/refresh token pair (OAuth2 password flow). |
| POST | `/auth/logout` | JWT Bearer | Blacklist the current access token. |
| POST | `/auth/refresh` | None (rate-limited 10/min) | Exchange a refresh token for a new token pair. |
| GET | `/auth/exists` | None | Check whether a username or email is already registered. |
| POST | `/auth/reauthenticate` | JWT Bearer (rate-limited 5/min) | Verify the current password and obtain a short-lived re-auth token. |
| POST | `/auth/change-password` | JWT Bearer (rate-limited 3/min) | Change the authenticated user's password. |
| GET | `/auth/terms` | None | Return the full Terms and Conditions text. |
| POST | `/auth/verify/verify-code` | None | Verify a 6-digit email verification code and mark the account (or new email) as verified. |
| POST | `/auth/verify/resend-verification-code` | JWT Bearer | Resend the verification code. Pass `email` query param to change/verify a new email (requires a re-auth token). |

Field-level request/response schemas for every endpoint above are in [`openapi/authentication.yaml`](openapi/authentication.yaml). What follows here is business logic and error conditions that OpenAPI doesn't capture structurally (FastAPI only declares `200`/`404`/`422` in the schema unless a route explicitly sets `responses=`; the `401`/`403`/`429` cases below are real but only documented here).

## Login (`POST /auth/token`)

Despite the OAuth2 field name `username`, this field accepts the user's **email address**.

- `401` — incorrect credentials (detail includes `attempts_remaining`)
- `403` — account is banned (detail includes ban expiry)
- `429` — rate limit or account lockout (detail includes `locked_until`, `attempts_remaining`)

**Lockout behaviour:** see [features/authentication/design.md](../features/authentication/design.md#login-lockout)
for the canonical schema, budget/cooldown tiers, and phantom-budget mechanism.

## Reauthentication (`POST /auth/reauthenticate`)

Verifies the current password and issues a short-lived re-auth token used to authorize sensitive operations elsewhere in the API (e.g. changing the account email via `POST /auth/verify/resend-verification-code?email=...`). Returns `401` on wrong password.

## Change password (`POST /auth/change-password`)

Returns `401` if the supplied current password doesn't match.

Bootstrap and administrator-password resets mark the account as requiring a password change. Authenticated HTTP endpoints then return `403` with `PASSWORD_CHANGE_REQUIRED`; only logout (`POST /auth/logout` and `POST /api/admin/logout`), reauthentication, and this endpoint remain available. WebSocket connections authenticate separately and are not gated.

For a flagged account with no Terms acceptance timestamp, this request must include `terms_accepted: true` or it returns `400` with `TERMS_ACCEPTANCE_REQUIRED`. Password replacement, clearing the requirement, and the first consent timestamp are committed together. Existing consent timestamps are never replaced.

Two further `400` codes apply to every caller, not just flagged accounts. `PASSWORD_REUSED` rejects a `new_password` equal to `current_password` — without it, a mandatory change is satisfiable by resubmitting the installer-chosen credential, which would make a one-shot password permanent. `PASSWORD_TOO_WEAK` carries the specific unmet rule; replacement passwords must meet the same 8–128 character, upper/lower/digit rules as passwords chosen at signup.

## Email verification (`POST /auth/verify/verify-code`, `POST /auth/verify/resend-verification-code`)

- `verify-code` returns `400` for an invalid/expired code, `404` if the user isn't found.
- `resend-verification-code` with an `email` query param sends the code to a *new* address instead of the current one — this requires a valid re-auth token (see above) since it changes account contact info.
- If the account is already verified and no `email` is supplied, the endpoint returns `{ "message": "Email already verified" }` without sending anything (still `200`, not an error).
