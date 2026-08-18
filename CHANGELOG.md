# Changelog

All notable changes to this project are documented here. SAPOT versions its
**mobile**, **server**, **admin**, **captive portal**, and **GSM module**
components independently — see [VERSIONING.md](VERSIONING.md) for the tag
convention and release process.

This file is manually curated today, seeded from existing release-tag annotations.
Once each component has enough tagged history, it should be regenerated with
[git-cliff](https://git-cliff.org) using the config in [cliff.toml](cliff.toml):

```bash
git-cliff --tag-pattern '^server/v' --include-path 'server/**' -o CHANGELOG.md
git-cliff --tag-pattern '^mobile/v' --include-path 'mobile-app/**' -o CHANGELOG.md
```

---

## bundle/v0.2.0 — 2026-08-18

**Features**

- **GSM port management:** Added scripts to update the Arduino serial port and automatically restart the GSM API.

---

## mobile/v0.11.0 — 2026-08-18

**Fixes**

- Safely clear user state on logout (#382). Resolves a crash that occurred when background components or UI views attempted to read the user ID of a logged-out user. A new `hasUser` safety guard was added across all chat, map, and debug views, and the UserStore now correctly clears all internal state upon logout.

---

## bundle/v0.1.0 — 2026-08-18

**Features**

- **GSM auto-detection (install):** Automatically detects connected GSM Arduino ports and presents an interactive selection menu during installation (`install.sh`), replacing the manual boolean prompt. The selected port is automatically synchronized to `gsm-arduino.env` and `gsm-fastapi.env`.
- **GSM upgrade prompt (upgrade):** Added an interactive prompt to `upgrade.sh` to auto-detect the GSM Arduino port if upgrading from bundle versions older than 0.0.8 and GSM hardware isn't already configured.

---

## server/v0.0.2-beta.1 — 2026-06-26

First tagged server release. All commits represent the initial release of the server component.

**Features**

- IP-based rate limiting and account lockout: failed login/recovery attempts are tracked per IP, with `attempts_remaining` returned in 401 responses.
- Recovery flow hardened: recovery tokens burned atomically on password reset; security questions are single-use and burned after verification; cooldowns enforced via a new `/recovery-constraints` endpoint.
- Reauthentication endpoint added for sensitive in-session actions (change password, update email/phone).
- Current-password guard required before accessing security questions or generating a new recovery key.
- Terms and conditions acceptance tracked on registration.
- TLS enabled on Gunicorn using a self-signed certificate for local/staging deployments.
- ECDH key registration and signed credential API for end-to-end encrypted sessions.
- GPS WebSocket now requires token authentication; offline location updates are buffered and delivered on reconnect.
- User online/offline status tracked on WebSocket connect and disconnect.
- Redis-backed connection manager with pub/sub presence and per-request session isolation.
- Inbound SMS queued when the recipient is offline and delivered on next connection.
- GSM module integrated with the backend for real SMS delivery.
- Phone number verification flow added (required before SMS features activate).
- Users can opt in to allow unknown numbers to contact them via SMS or the app.
- Public chat displays the sender's name in real time.
- Admin and rescuer role badges shown in conversations.
- Captive portal serves the mobile APK with chunked download support.
- MikroTik router API endpoints and admin dashboard added.
- Announcements module: create, auto-expire, and search announcements.
- Activity log endpoint for admin audit trail.
- Admin dashboard aligned with the mobile app's role model (admin/rescuer).
- Email and phone number updates now require verification before the change is committed.
- Recovery key and security question records include `created_at`/`updated_at` timestamps and burn state.

**Fixes**

- GPS WebSocket endpoint now requires authentication; admin-only testing endpoints guarded behind an admin role check.
- Refresh token expiration calculation corrected in `create_token_pair`.
- Message decryption fixed in account recovery flows.
- Call session recovery restored after connectivity failure.
- Message queue error handling improved to prevent silent drops.
- Full security question list returned correctly from the `generate-security-question` endpoint.

**Changed**

- Device fingerprint and ECDH challenge-based auth removed; authentication is now fully token-based.
- Gunicorn worker count, Nginx static file serving, and MySQL connection pooling tuned for production load.
- Redis-backed rate limiting replaces in-memory limiting, supporting multi-process deployments.

**Known issues (beta)**

- Intended for testing only.
- TLS uses a self-signed certificate — testers should expect browser/client certificate warnings.
- Redis is now a required runtime dependency; ensure it is running before starting the server.
- An `.env.example` file is included — copy it to `.env` and fill in secrets before running.

---

## mobile-app/0.9.1-beta — 2026-06-26

- `docs(webrtc)`: updated `ARCHITECTURE.md` `WebrtcAdapter` description.

---

## v0.9.0-dev — 2026-06-25

- `feat(version)`: bumped repo version to `0.9.0`.

---

## v0.8.0-dev — 2026-06-21

- Tagged release `0.8.0-dev`.

---

_Tags prior to the mobile/server split (`v0.8.0-dev`, `v0.9.0-dev`) predate the per-component
versioning scheme introduced in [VERSIONING.md](VERSIONING.md) and are kept here for history only._
