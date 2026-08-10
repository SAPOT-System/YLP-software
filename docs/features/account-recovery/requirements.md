# Account Recovery — Requirements

## Overview

Account recovery allows users who have forgotten their password to regain access using one of four verification methods: email OTP, phone OTP, security question, or a recovery key file.

---

## User Stories

| ID | As a… | I want to… | So that… |
|----|-------|-----------|----------|
| AR-01 | user who forgot my password | request a password reset via email OTP | I can regain access if I have my registered email |
| AR-02 | user who forgot my password | request a password reset via SMS OTP to my registered phone number | I can regain access without email |
| AR-03 | user who forgot my password | answer my security question to prove my identity | I can reset my password without email or phone |
| AR-04 | user who forgot my password | use a recovery key file I downloaded at account setup | I can reset my password without any other verification |
| AR-05 | user | set up a security question and answer during or after account creation | I have a recovery method available |
| AR-06 | user | download a recovery key file from my account settings | I have an offline recovery method for future use |

---

## Functional Requirements

### FR-AR-01 — Recovery initiation

- `POST /auth/forgot-password/email` — sends a 6-digit OTP to the registered email. OTP expires in 10 minutes.
- `POST /auth/forgot-password/phone` — sends a 6-digit OTP via SMS to the registered phone number. Requires GSM module.
- `POST /auth/forgot-password/security-question` — returns the user's stored question; validates the answer server-side.
- `POST /auth/forgot-password/recovery-key` — validates the recovery key file content against the stored hash.

### FR-AR-02 — Recovery session

- All successful verification methods return a short-lived `recovery_token`.
- The token hash is stored in `recovery_session` with the `method` used and an `expires_at` timestamp.
- The `recovery_token` is single-use: consumed when the password reset is submitted.

### FR-AR-03 — Password reset

- `POST /auth/reset-password` — accepts the `recovery_token` and a new password.
- Validates the token against `recovery_session`, checks expiry, resets the password, and deletes the session record.

### FR-AR-04 — Security question setup

- User provides a free-text question and an answer.
- The answer is hashed with Argon2 before storage in `usersecurityquestion`.
- Only one security question per user (`user_id` is unique in the table).

### FR-AR-05 — Recovery key setup

- `POST /users/recovery-setup` — stores a hashed recovery key in `wrapped_key_recovery`.
- `GET /users/recovery-key` — returns the key material for the user to download and store securely.

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-AR-01 | Recovery OTPs expire in 10 minutes (`email_verifications.expires_at`) |
| NFR-AR-02 | Phone-based recovery requires the GSM module service to be running |
| NFR-AR-03 | All recovery endpoints must be rate-limited to prevent enumeration and brute-force attempts |
| NFR-AR-04 | Recovery tokens must not be logged or returned in error messages |

---

## Out of Scope

See [design.md#non-goals](design.md#non-goals) for what this feature explicitly does not cover.
