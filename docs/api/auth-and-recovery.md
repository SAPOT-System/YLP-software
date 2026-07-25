# Account Recovery API

Machine-readable spec: [`openapi/auth-and-recovery.yaml`](openapi/auth-and-recovery.yaml) (generated from the live FastAPI app — regenerate if this file goes stale).

All recovery endpoints are under `/auth/forgot-password/` (router defined in `server/app/api/forgot_password.py`). The recovery system supports multiple methods: email OTP (legacy + magic-link), phone OTP (legacy + new), recovery key file, and security questions.

---

## Recovery flow overview

```
1. Initiate recovery (choose method: email, phone, recovery key, or security question)
2. Verify the chosen factor
3. Receive a `recovery_token` (short-lived RecoverySession) and/or a reset link/token
4. POST /auth/forgot-password/reset-password with the reset token (and optionally the recovery_token) to set the new password
```

Two parallel token systems exist:
- **Reset token** (`PasswordResetToken`, `LINK_TTL_SECONDS` = 30 min) — required by `POST /reset-password`.
- **Recovery session token** (`RecoverySession`, 15 min) — returned alongside the reset token by most verify endpoints; passed as `recovery_token` in the final reset call and burned atomically with the password update.

```mermaid
sequenceDiagram
    participant User
    participant Server

    User->>Server: verify factor (phone-code / email-code /<br/>security-question/answer / recovery-with-recovery-key / otp/verify)
    Server-->>User: reset_token (PasswordResetToken, 30 min TTL)<br/>+ recovery_token (RecoverySession, 15 min TTL)

    User->>Server: POST /reset-password?token=&lt;reset_token&gt;<br/>{ new_password, recovery_token?, wrapped_blob? }
    Server->>Server: validate reset_token
    Server->>Server: reset password (Argon2 hash)
    Server->>Server: if recovery_token present: validate + mark RecoverySession used<br/>(best-effort — failure here does not block the reset)
    Server->>Server: if wrapped_blob present: upsert WrappedKey row
    Server-->>User: 200 OK
```

Per-(user, device/IP, method) attempt gating is enforced via `RecoveryAttempt`/`check_and_increment_attempt` (429 with `locked_until` on lockout) for the phone-code, recovery-key, email-code, and security-question verify flows.

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/auth/forgot-password/phone` | None | Send a numeric reset code via SMS to a phone number (legacy flow). Always returns a generic message. |
| POST | `/auth/forgot-password/phone-code` | None (rate-limited 10/min) | Verify the phone reset code; returns a reset link and `recovery_token`. |
| POST | `/auth/forgot-password/generate-new-recovery-key` | Bearer token + `X-Current-Password` header | Generate and download a new recovery key file. 30-day cooldown (`RECOVERY_KEY_COOLDOWN_DAYS`) between regenerations. |
| POST | `/auth/forgot-password/recovery-with-recovery-key` | None (rate-limited 10/min) | Verify an uploaded recovery key file (`multipart/form-data`, query `user_identifier`); returns a reset link and `recovery_token`. |
| GET | `/auth/forgot-password/reset-password` | None | Validate a reset token (query `token`) before showing the reset-password form. |
| POST | `/auth/forgot-password/reset-password` | None | Reset the password using a valid reset `token` (query) plus `new_password` (and optional `wrapped_blob`, `recovery_token`) in the body. |
| POST | `/auth/forgot-password/email-code` | None (rate-limited 10/min) | Verify the email reset code (query `email`, `code`); returns a reset link and `recovery_token`. |
| POST | `/auth/forgot-password/email` | None | Send a numeric reset code via email (query `email`). Always returns a generic message. |
| POST | `/auth/forgot-password/security-questions` | Bearer token + `X-Current-Password` header | Set/replace the user's security question. Cooldown: 90 days min, 180 days max (auto-expires), or immediate if the existing question was already "burned". |
| GET | `/auth/forgot-password/security-question` | None | Fetch a random security question for a user (query `identifier`); also stores a fresh reset token server-side. |
| POST | `/auth/forgot-password/security-question/answer` | None (rate-limited 10/min) | Verify the answer to a security question (query `identifier`); on success returns `reset_link` and `recovery_token`. |
| GET | `/auth/forgot-password/generate-security-question` | Bearer token | Return the full candidate question bank the client can offer the user to choose from. |
| GET | `/auth/forgot-password/recovery-constraints` | Bearer token | Return recovery-key and security-question cooldown/expiry status for the current user. |
| POST | `/auth/forgot-password/otp/send` | None (rate-limited 3/min) | Send a phone OTP for recovery (query `phone_number`) — newer flow, hashes the code at rest. |
| POST | `/auth/forgot-password/otp/verify` | None (rate-limited 5/min) | Verify the phone OTP; 3 attempts before a 10-minute lockout. Returns `recovery_token` + `user_id`. |
| POST | `/auth/forgot-password/email-recovery/send` | None (rate-limited 3/min) | Send an email magic-link recovery token (query `email`) as a `sapot://auth/email-recovery?t=...` deep link. |
| GET | `/auth/forgot-password/email-recovery/verify` | None (rate-limited 5/min) | Verify the magic-link token (query `t`), single-use, 30-min expiry. Returns `recovery_token` + `user_id`. |

---

## Reset Password

### POST /auth/forgot-password/reset-password

Resets the password using a reset `token` (query param) plus the JSON body described in [`openapi/auth-and-recovery.yaml`](openapi/auth-and-recovery.yaml). Two behaviors not visible in the schema:

- If `wrapped_blob` is present, the user's `WrappedKey` row is upserted with the new blob (used when the client re-wraps the local encryption key under the new password).
- If `recovery_token` is present, the matching `RecoverySession` is validated and marked used — failures here are swallowed silently (best-effort) so the password reset itself is not blocked.

---

See [auth-and-recovery.yaml](openapi/auth-and-recovery.yaml) for exact field-level request/response schemas (including `RecoveryConstraintsOut`, `SecurityQuestionOut`, `AddSecurityQuestion`, etc.), or the live server's `/docs` / `/openapi.json`.
