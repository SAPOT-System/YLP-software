# Account Recovery — Testing

## Test strategy

Recovery tests verify that each of the four verification methods correctly issues a recovery token, and that the password reset endpoint correctly consumes the token and updates the password. Rate-limiting and token expiry must also be tested.

---

## Server — integration tests

### Email OTP recovery

| Scenario | Expected result |
|---|---|
| Valid registered email → request OTP | 200, OTP stored in `email_verifications`, email sent |
| Submit correct OTP within 10 minutes | 200, `recovery_token` returned |
| Submit expired OTP | 401 Unauthorized |
| Submit wrong OTP | 401 Unauthorized |
| Unregistered email | 404 or 200 (no enumeration — verify behavior) |

### Phone OTP recovery

| Scenario | Expected result |
|---|---|
| Valid registered phone → request OTP | 200, SMS sent via GSM module |
| Submit correct OTP | 200, `recovery_token` returned |
| Submit expired OTP | 401 Unauthorized |
| GSM module unavailable | 503 Service Unavailable (or appropriate error) |

### Security question recovery

| Scenario | Expected result |
|---|---|
| User has no security question set | 404 Not Found |
| Correct answer | 200, `recovery_token` returned |
| Wrong answer | 401 Unauthorized |

### Recovery key

| Scenario | Expected result |
|---|---|
| Valid recovery key content | 200, `recovery_token` returned |
| Wrong key content | 401 Unauthorized |
| No recovery key set for user | 404 Not Found |

### Password reset

| Scenario | Expected result |
|---|---|
| Valid `recovery_token` + new password | 200, `user.hashed_password` updated |
| Expired `recovery_token` | 401 Unauthorized |
| Token already consumed (replay) | 401 Unauthorized |
| Malformed token | 422 or 401 |

---

## Recovery session lifecycle tests

- After successful verification: `recovery_session` row exists with correct `method` and future `expires_at`.
- After successful password reset: `recovery_session` row is deleted.

---

## Security question setup tests

| Scenario | Expected result |
|---|---|
| Set question and answer | 200, answer stored as Argon2 hash (not plaintext) |
| Update existing question | 200, old record replaced |
| Retrieve question text | 200, question text returned (answer hash not exposed) |

---

## Coverage targets

- All four recovery methods: happy path and at least two error paths each.
- Token expiry: at least one test per method verifying expired tokens are rejected.
- Token replay: at least one test verifying a consumed token cannot be reused.
- Rate limiting: 429 response verified after limit exceeded on each recovery endpoint.

---

## Test data conventions

- Synthetic email: `user@example.com`.
- Synthetic phone: `+639123456789`.
- Synthetic OTP: `123456` (mocked in test environment — never hit the real GSM module).
- Reset `recovery_session`, `email_verifications`, `phone_verification` tables between test runs.
