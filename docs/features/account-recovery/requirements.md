# Account Recovery — Requirements

## Overview

Account recovery allows users who have forgotten their password to regain access using one of four verification methods: email OTP, phone OTP, security question, or a recovery key file.

---

## User stories

- As a user who forgot my password, I can request a password reset via email OTP so that I can regain access if I have my registered email.
- As a user who forgot my password, I can request a password reset via SMS OTP to my registered phone number.
- As a user who forgot my password, I can answer my security question to prove my identity and reset my password.
- As a user who forgot my password, I can use a recovery key file I downloaded at account setup to reset my password.
- As a user, I can set up a security question and answer during or after account creation.
- As a user, I can download a recovery key file from my account settings for future use.

---

## Functional requirements

### Recovery initiation

- `POST /auth/forgot-password/email` — sends a 6-digit OTP to the registered email. OTP expires in 10 minutes.
- `POST /auth/forgot-password/phone` — sends a 6-digit OTP via SMS to the registered phone number. Requires GSM module.
- `POST /auth/forgot-password/security-question` — returns the user's stored question; validates the answer server-side.
- `POST /auth/forgot-password/recovery-key` — validates the recovery key file content against the stored hash.

### Recovery session

- All successful verification methods return a short-lived `recovery_token`.
- The token hash is stored in `recovery_session` with the `method` used and an `expires_at` timestamp.
- The `recovery_token` is single-use: consumed when the password reset is submitted.

### Password reset

- `POST /auth/reset-password` — accepts the `recovery_token` and a new password.
- Validates the token against `recovery_session`, checks expiry, resets the password, and deletes the session record.

### Security question setup

- User provides a free-text question and an answer.
- The answer is hashed with Argon2 before storage in `usersecurityquestion`.
- Only one security question per user (`user_id` is unique in the table).

### Recovery key setup

- `POST /users/recovery-setup` — stores a hashed recovery key in `wrapped_key_recovery`.
- `GET /users/recovery-key` — returns the key material for the user to download and store securely.

---

## Constraints

- Recovery OTPs expire in 10 minutes (`email_verifications.expires_at`).
- Phone-based recovery requires the GSM module service to be running.
- All recovery endpoints must be rate-limited to prevent enumeration and brute-force attempts.
- Recovery tokens must not be logged or returned in error messages.
