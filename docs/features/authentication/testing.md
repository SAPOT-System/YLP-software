# Authentication — Testing

## Test strategy

Authentication tests cover server API endpoints and mobile client token management. The primary concern is correctness of security invariants: lockout triggers correctly, blacklisted tokens are rejected, rate limits enforce.

---

## Server — integration tests

### Registration (`POST /auth/`)

| Scenario | Expected result |
|---|---|
| Valid username, name, password | 201, user created, Argon2 hash stored |
| Duplicate username | 409 Conflict |
| Duplicate email | 409 Conflict |
| Username < 2 characters | 422 Unprocessable Entity |
| Phone number wrong format (`+63` not followed by 9 digits) | 422 Unprocessable Entity |
| > 3 requests/minute from same client | 429 Too Many Requests |

### Login (`POST /auth/token`)

| Scenario | Expected result |
|---|---|
| Valid email + correct password | 200, access_token + refresh_token returned |
| Wrong password | 401, attempt counter incremented |
| Non-existent email | 401, phantom lockout budget consumed |
| Account locked (`locked_until` in future) | 429 with lockout message |
| > 5 requests/minute | 429 Too Many Requests |

### Logout (`POST /auth/logout`)

| Scenario | Expected result |
|---|---|
| Valid access token | 200, jti written to blacklistedtoken |
| Reuse blacklisted token | 401 Unauthorized |
| No Authorization header | 401 Unauthorized |

### Token refresh (`POST /auth/refresh`)

| Scenario | Expected result |
|---|---|
| Valid refresh token | 200, new access_token returned |
| Expired refresh token | 401 Unauthorized |
| Blacklisted refresh token | 401 Unauthorized |
| Access token used instead of refresh | 401 (wrong token type) |

### Password change (`POST /auth/change-password`)

| Scenario | Expected result |
|---|---|
| Correct current password | 200, password updated |
| Wrong current password | 401 Unauthorized |
| > 3 requests/minute | 429 Too Many Requests |

---

## Mobile — token management tests

| Scenario | Expected result |
|---|---|
| Login stores tokens in `expo-secure-store` | Tokens retrievable after login |
| Logout clears tokens from `expo-secure-store` | No tokens present after logout |
| Access token expiry triggers refresh | New access token obtained transparently |
| Refresh token expiry forces re-login | User redirected to login screen |
| App restart with valid stored tokens | Session restored without re-login |

---

## Coverage targets

- All `POST /auth/*` endpoints: 100% branch coverage on happy path and error paths.
- Lockout: at least one test exhausting the attempt budget and verifying `locked_until` is set.
- Token blacklist: at least one test verifying a token cannot be reused after logout.
- Rate limiting: at least one test per rate-limited endpoint verifying 429 after limit exceeded.

---

## Test data conventions

- Synthetic emails: `user@example.com`, `admin@example.com`.
- Placeholder password: `Passw0rd!`.
- Never use real credentials in test fixtures.
- Reset `login_attempt` and `blacklistedtoken` tables between test runs.
