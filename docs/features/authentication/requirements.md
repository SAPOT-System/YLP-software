# Authentication — Requirements

## Overview

Authentication gates access to all SAPOT features. Users register with a username, name, and password; log in to receive JWT tokens; and are automatically locked out after repeated failures.

---

## User Stories

| ID | As a… | I want to… | So that… |
|----|-------|-----------|----------|
| AU-01 | new user | register an account with a username, first name, last name, and password | I can access the app |
| AU-02 | registered user | log in with my email or phone number and password | I receive an access token and refresh token |
| AU-03 | logged-in user | log out | my session is invalidated immediately |
| AU-04 | logged-in user | refresh my access token | I don't have to re-enter my password |
| AU-05 | user | be locked out after repeated failed login attempts | my account is protected from brute-force attacks |
| AU-06 | admin | check whether an account exists for a given email | I don't reveal sensitive data doing so |
| AU-07 | logged-in user | change my password after re-authenticating | I can update my credentials securely |
| AU-08 | logged-in user | re-authenticate (verify my current password) | I can perform sensitive operations safely |

---

## Functional Requirements

### FR-AU-01 — Registration

- Username: 2–50 characters, unique across all users.
- First name and last name: minimum 2 characters each.
- Email (optional): unique if provided.
- Phone number (optional): unique if provided, must match pattern `+639XXXXXXXXX`.
- Password hashed with Argon2 before storage.
- Terms acceptance timestamp recorded at registration.

### FR-AU-02 — Login

- Accepts `username` field as email address (OAuth2 password flow).
- Returns `access_token` (short-lived JWT) and `refresh_token` (long-lived JWT).
- Each token carries a unique `jti` (JWT ID) for blacklisting.
- Rate limited to 5 requests/minute per client.

### FR-AU-03 — Logout

- Blacklists the access token's `jti` in the `blacklistedtoken` table.
- Blacklists the refresh token's `jti` as well.
- Subsequent requests with the same tokens are rejected (401).

### FR-AU-04 — Token refresh

- Accepts a valid, non-blacklisted refresh token.
- Returns a new access token.
- Rate limited to 10 requests/minute per client.
- Old refresh token is blacklisted on use (rotation).

### FR-AU-05 — Login lockout

- Tracks failed attempts per `(user_id, client_ip)` pair in `login_attempt` table.
- After threshold failures: account locked for a configurable duration (`locked_until`).
- Uses a "phantom budget" — non-existent accounts consume the same lockout budget as real accounts (prevents username enumeration via timing).

### FR-AU-06 — Password change

- Requires current password verification before accepting a new password.
- Rate limited to 3 requests/minute.

### FR-AU-07 — Re-authentication

- `POST /auth/reauthenticate` verifies the current password and returns a short-lived re-auth token.
- Rate limited to 5 requests/minute.

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-AU-01 | All auth endpoints are rate-limited via Slowapi |
| NFR-AU-02 | JWT secret key must be set via `JWT_SECRET_KEY` environment variable (hardcoded default must not be used in production) |
| NFR-AU-03 | Auth endpoints are available over HTTPS only (Nginx enforces port 80 → 443 redirect) |

---

## Out of Scope

See [design.md#non-goals](design.md#non-goals) for what this feature explicitly does not cover.
