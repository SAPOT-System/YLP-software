# Authentication — Design

## Architecture

Authentication is implemented in `server/app/api/auth.py` with supporting operations in `server/app/db_operations/auth.py` and `server/app/db_operations/token.py`.

This feature is server-mediated; it has no P2P path.

---

## Token model

SAPOT uses a **dual-token JWT system**:

| Token | Lifetime | Purpose |
|---|---|---|
| `access_token` | Short (minutes) | Sent with every authenticated request as `Authorization: Bearer <token>` |
| `refresh_token` | Long (days) | Used only to obtain a new access token via `POST /auth/refresh` |
| `reauth_token` | Very short | Returned by `POST /auth/reauthenticate`; used to authorize sensitive operations |

Each token payload includes:
- `sub` — user ID (UUID)
- `jti` — unique token ID (UUID4) for blacklisting
- `exp` — expiry timestamp
- `type` — `"access"`, `"refresh"`, or `"reauth"`

---

## Token blacklisting

On logout, both the access and refresh token `jti` values are written to the `blacklistedtoken` table. Every protected endpoint validates the token's `jti` against this table before processing the request.

`blacklistedtoken` columns: `id` (UUID PK), `jti` (VARCHAR, unique, indexed), `expires_at` (DATETIME). Expired entries can be pruned without affecting security.

---

## Password hashing

Passwords are hashed using **Argon2** via `pwdlib`'s `Argon2Hasher` (`server/app/db_operations/auth.py`). The hash is stored in `user.hashed_password`. Plain-text passwords are never written to logs or stored anywhere besides the hash.

---

## Login lockout

**Canonical source for lockout behaviour** — [security-architecture.md](../../architecture/security-architecture.md#login-lockout)
and [api/authentication.md](../../api/authentication.md) link here rather than restating this.

Implemented in `server/app/db_operations/device_attempts.py`, backed by the `login_attempt` table.
Despite the column name, `(user_id, device_fingerprint)` is keyed on `(user_id, client_ip)` in the
login flow (`server/app/api/auth.py`'s `POST /auth/token` passes the resolved client IP as the
`device_fingerprint` value — the column is shared with a separate device-based recovery flow, hence
the name):

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID | Synthetic (`uuid5` of the submitted email) for non-existent accounts — see phantom budget below |
| `device_fingerprint` | VARCHAR(64) | Holds the client IP for login attempts (see note above) |
| `attempt_count` | INTEGER | Incremented on each failure; reset to 0 after a lockout expires or on success |
| `lockout_count` | INTEGER | Incremented every time the account gets locked; selects the next cooldown tier |
| `locked_until` | DATETIME | Nullable; set when `attempt_count` exceeds the budget |
| `last_attempt_at` | DATETIME | Nullable; timestamp of the most recent attempt |

**Budget and cooldown:** `ATTEMPT_BUDGET = 5` failures before lockout. Cooldown escalates per
`lockout_count` through `COOLDOWN_TIERS = [15s, 60s, 6h, 24h]` (capped at the last tier for repeat
offenders).

**Phantom budget:** For email addresses that match no user, a synthetic `user_id` (`uuid5` of the
submitted email) is used so non-existent accounts consume the same lockout budget as real accounts,
preventing timing-based username enumeration.

---

## Rate limiting

Canonical per-endpoint limits and the 429 response shape are documented in
[api/conventions.md](../../api/conventions.md#rate-limiting) — not restated here.

---

## Mobile client flow

```
Register  → POST /auth/         → store tokens in expo-secure-store
Login     → POST /auth/token    → store access + refresh tokens
Request   → Authorization: Bearer <access_token>
Expiry    → POST /auth/refresh  → new access_token (rotate refresh)
Logout    → POST /auth/logout   → blacklist tokens, clear secure storage
```

Tokens are stored in `expo-secure-store` (encrypted, hardware-backed on Android). Never stored in AsyncStorage.

---

## Security considerations

See the repo-root `SECURITY.md` for the canonical list of resolved and outstanding security gaps.

- Re-auth tokens are scoped to sensitive operations only and expire quickly.

---

## Non-goals

- No OAuth/social login (Google, Apple, etc.) — email/password is the only registration path, matching the LAN-deployment model where third-party identity providers aren't reachable.
- No multi-factor authentication (TOTP/hardware key) at login time — [account-recovery](../account-recovery/design.md)'s OTP methods exist for *recovery*, not as a second login factor.
- No remote session/device management UI for end users — see [threat-model.md](../../architecture/threat-model.md#device-theft).

## Failure handling

- **Lockout is fail-closed, not fail-open:** once `ATTEMPT_BUDGET` is exceeded, `POST /auth/token` rejects even correct credentials until the cooldown tier expires — see [login lockout](#login-lockout).
- **Non-existent accounts fail identically to wrong passwords** (phantom budget, above) — the client cannot distinguish "no such user" from "wrong password" by response shape or timing.
- **Token refresh failure:** an expired or blacklisted refresh token returns 401; the mobile client's contract is to force a full re-login rather than retry silently.
- **Database unavailable during login:** `POST /auth/token` fails with 5xx; no offline login exists client-side (guest mode is the offline alternative — see [system-overview.md roles](../../architecture/system-overview.md#roles)).

## Performance impact

- Argon2 hashing is deliberately CPU-expensive (that's the point of the algorithm) — login/registration throughput is bounded by hashing cost, not I/O. This is an accepted tradeoff between brute-force resistance and login latency.
- The `login_attempt` lookup is a single indexed query per login attempt; negligible overhead relative to hashing.
- JWT validation on every authenticated request is a stateless signature check plus one indexed `blacklistedtoken` lookup — O(1) per request, not a bottleneck at LAN incident-site scale.

## Scalability

- Designed for LAN incident-site scale (tens to low hundreds of concurrent users per [system-overview.md](../../architecture/system-overview.md)), not internet-scale traffic — no distributed session store or horizontal-scaling considerations have been made for auth state.
- The `blacklistedtoken` table grows unboundedly until pruned; expired entries can be safely deleted (noted in [Token blacklisting](#token-blacklisting)) but no automated pruning job exists today.

## Acceptance criteria

- A user can register, log in, and receive a valid access/refresh token pair.
- An account is locked out after `ATTEMPT_BUDGET` (5) consecutive failed attempts, with escalating cooldowns per `COOLDOWN_TIERS`.
- A non-existent email produces the same lockout behavior and response shape as a wrong password for an existing account (no enumeration).
- A blacklisted (logged-out) token is rejected by every protected endpoint.
- Passwords are never stored or logged in plaintext.
