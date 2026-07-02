# Authentication — Requirements

## Overview

Authentication gates access to all SAPOT features. Users register with a username, name, and password; log in to receive JWT tokens; and are automatically locked out after repeated failures.

---

## User stories

- As a new user, I can register an account with a username, first name, last name, and password so that I can access the app.
- As a registered user, I can log in with my email or phone number and password to receive an access token and refresh token.
- As a logged-in user, I can log out and have my session invalidated immediately.
- As a logged-in user, I can refresh my access token without re-entering my password.
- As a user, I am locked out after repeated failed login attempts to protect my account from brute-force attacks.
- As an admin, I can check whether an account exists for a given email without revealing sensitive data.
- As a logged-in user, I can change my password after re-authenticating.
- As a logged-in user, I can re-authenticate (verify my current password) before performing sensitive operations.

---

## Functional requirements

### Registration

- Username: 2–50 characters, unique across all users.
- First name and last name: minimum 2 characters each.
- Email (optional): unique if provided.
- Phone number (optional): unique if provided, must match pattern `+639XXXXXXXXX`.
- Password hashed with Argon2 before storage.
- Terms acceptance timestamp recorded at registration.

### Login

- Accepts `username` field as email address (OAuth2 password flow).
- Returns `access_token` (short-lived JWT) and `refresh_token` (long-lived JWT).
- Each token carries a unique `jti` (JWT ID) for blacklisting.
- Rate limited to 5 requests/minute per client.

### Logout

- Blacklists the access token's `jti` in the `blacklistedtoken` table.
- Blacklists the refresh token's `jti` as well.
- Subsequent requests with the same tokens are rejected (401).

### Token refresh

- Accepts a valid, non-blacklisted refresh token.
- Returns a new access token.
- Rate limited to 10 requests/minute per client.
- Old refresh token is blacklisted on use (rotation).

### Login lockout

- Tracks failed attempts per `(user_id, client_ip)` pair in `login_attempt` table.
- After threshold failures: account locked for a configurable duration (`locked_until`).
- Uses a "phantom budget" — non-existent accounts consume the same lockout budget as real accounts (prevents username enumeration via timing).

### Password change

- Requires current password verification before accepting a new password.
- Rate limited to 3 requests/minute.

### Re-authentication

- `POST /auth/reauthenticate` verifies the current password and returns a short-lived re-auth token.
- Rate limited to 5 requests/minute.

---

## Constraints

- All auth endpoints are rate-limited via Slowapi.
- JWT secret key must be set via `JWT_SECRET_KEY` environment variable (hardcoded default must not be used in production).
- Auth endpoints are available over HTTPS only (Nginx enforces port 80 → 443 redirect).
