# Test Data & Environment Appendix — SAPOT Mobile App

Companion to [`test-cases.md`](./test-cases.md).  
Last updated: 2026-06-25

---

## Contents

- [A. Environment Prerequisites](#a-environment-prerequisites)
- [B. Seeded Account Catalog](#b-seeded-account-catalog)
- [C. State-Control API Reference](#c-state-control-api-reference)
- [D. Deterministic OTP Test Mode](#d-deterministic-otp-test-mode)
- [E. Reusable Login Fixture (Jest / RNTL)](#e-reusable-login-fixture-jest--rntl)
- [F. Teardown & Reset](#f-teardown--reset)

---

## A. Environment Prerequisites

All automated and manual tests target the **staging** server. Never run state-mutation procedures against production.

| Component | Version / Target | Config source |
|-----------|-----------------|---------------|
| Python FastAPI server | `server/` — run via `runserver.sh` | `server/.env` |
| MySQL 8 | `sapot_db` database, local or staging | `DB_URL` in `.env` |
| Redis | `redis://localhost:6379` | `REDIS_URL` in `.env` — server falls back to MySQL if absent |
| Expo app | `mobile-app/sapot-mobile-app/` | `config/runtime.ts` |
| Server URL (staging) | `https://sapot.online` | EAS channel `preview` / `production` |
| Server URL (local dev) | `http://<DEV_HOST>:8000` | `DEV_HOST` in `config/runtime.ts` |

### Required server env vars for the test environment

Add to `server/.env` on the staging or local test server — **not production**:

```dotenv
# Enables /testing/* routes (already included in main.py; must be removed before production)
SAPOT_TEST_MODE=true

# Deterministic OTP override — see Section D (leave unset on production)
# SAPOT_TEST_OTP_CODE=123456

JWT_SECRET_KEY=<64-char hex — must match any tokens already minted in this environment>
```

---

## B. Seeded Account Catalog

These are the canonical test identities. Create them once per environment using the script in Section B.3. All passwords satisfy the server's complexity rule: ≥8 chars, ≥1 digit, ≥1 lowercase, ≥1 uppercase.

### B.1 Account table

| Handle | Username | Password | Role | Special state | Primary TCs |
|--------|----------|----------|------|---------------|-------------|
| `qa_baseline` | `qa_baseline` | `Baseline1` | regular user | none | Most auth / chat / call tests |
| `qa_baseline_b` | `qa_baseline_b` | `Baseline1` | regular user | none | 2-device peer — TC-280–TC-289 |
| `qa_rescuer` | `qa_rescuer` | `Rescuer1!` | rescuer | `rescuer` row present | TC-170, TC-171, TC-201 |
| `qa_admin` | `qa_admin` | `Admin1!xx` | admin | `admin` row present | All `/admin/*` calls |
| `qa_banned` | `qa_banned` | `Banned1!x` | regular user | `banned_user.until = 2099-01-01` | TC-014 |
| `qa_phone` | `qa_phone` | `Phone1!xx` | regular user | `phone_number = +639171110001`, phone verified | TC-054, TC-055, TC-089 |
| `qa_email` | `qa_email` | `Email1!xx` | regular user | `email = qa_email@sapot.test` | TC-051, TC-053 |

**Guests** are ephemeral LAN identities created inside the app (Getting Started → LAN mode). No server account or seeding is required.

### B.2 Account states that require additional setup after registration

| Account | What to do after `POST /auth/` | Why |
|---------|-------------------------------|-----|
| `qa_rescuer` | `POST /testing/test-make-rescuer?username=qa_rescuer` | Inserts row into `rescuer` table |
| `qa_admin` | `POST /testing/test-make-admin?username=qa_admin` | Inserts row into `admin` table |
| `qa_banned` | `POST /admin/ban/user?user_id=<uuid>&duration_in_days=26645` (auth as `qa_admin`) | Creates `banned_user` row with `until` ~73 years from now |
| `qa_phone` | Insert into `phone_verified` table (see SQL below) | Phone OTP flow not automatable without a real SMS sink |
| `qa_locked` | Run lockout SQL (see Section C) before each TC-013 run; reset after | `login_attempt` row with `attempt_count=5`, `locked_until` in future |

**Phone verification SQL** (run on staging DB only):

```sql
INSERT INTO phone_verified (id, user_id, phone_number, verified_at)
SELECT UUID(), id, phone_number, NOW()
FROM user WHERE username = 'qa_phone'
ON DUPLICATE KEY UPDATE verified_at = NOW();
```

### B.3 Seed script

Run once per environment. Requires `curl` and `jq`. Replace `BASE_URL` as needed.

```bash
#!/usr/bin/env bash
# seed-test-accounts.sh
set -euo pipefail
BASE_URL="${SAPOT_TEST_BASE_URL:-http://localhost:8000}"

register() {
  local username=$1 password=$2 first=$3 last=$4 extra="${5:-}"
  curl -sf -X POST "$BASE_URL/auth/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$password\",\
\"first_name\":\"$first\",\"last_name\":\"$last\",\"terms_accepted\":true$extra}" \
    | jq -r '.access_token // empty'
}

# Plain users
register qa_baseline   Baseline1  QA Baseline
register qa_baseline_b Baseline1  QA BaselineB

# Rescuer
register qa_rescuer "Rescuer1!" QA Rescuer
curl -sf -X POST "$BASE_URL/testing/test-make-rescuer?username=qa_rescuer" > /dev/null

# Admin (seeded first so it can be used to ban others)
register qa_admin "Admin1!xx" QA Admin
curl -sf -X POST "$BASE_URL/testing/test-make-admin?username=qa_admin" > /dev/null

ADMIN_TOKEN=$(curl -sf -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=qa_admin&password=Admin1!xx" | jq -r '.access_token')

# Banned user
register qa_banned "Banned1!x" QA Banned
BANNED_ID=$(curl -sf "$BASE_URL/auth/exists?identifier=qa_banned" | jq -r '.user_id')
curl -sf -X POST "$BASE_URL/admin/ban/user?user_id=$BANNED_ID&duration_in_days=26645" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null

# Phone user (phone verification applied via SQL after this step)
register qa_phone "Phone1!xx" QA Phone ',\"phone_number\":\"+639171110001\"'

# Email user
register qa_email "Email1!xx" QA Email ',\"email\":\"qa_email@sapot.test\"'

echo "Accounts created. Run phone_verified INSERT for qa_phone, then verify with:"
echo "  curl -sf $BASE_URL/auth/exists?identifier=qa_baseline | jq"
```

---

## C. State-Control API Reference

### C.1 Endpoints that exist today

All `/admin/*` routes require `Authorization: Bearer <qa_admin access token>`.

```bash
# Convenience — store admin token in a shell variable
ADMIN_TOKEN=$(curl -sf -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=qa_admin&password=Admin1!xx" | jq -r '.access_token')
```

| Precondition to produce | Method | Path | Key params |
|------------------------|--------|------|------------|
| Account is admin | POST | `/testing/test-make-admin` | `?username=<x>` (no auth required) |
| Account is rescuer | POST | `/testing/test-make-rescuer` | `?username=<x>` (no auth required) |
| Account is banned | POST | `/admin/ban/user` | `?user_id=<uuid>&duration_in_days=<n>` |
| Account is unbanned | POST | `/admin/unban/user` | `?user_id=<uuid>` |
| New user via admin | POST | `/admin/create/user` | JSON `UserCreate` body |
| User hard-deleted | POST | `/admin/delete/user` | `?user_id=<uuid>` |

> **Security note:** `/testing/test-make-admin` and `/testing/test-make-rescuer` carry **no auth guard** — this is the open bug documented in TC-246. These routes must be removed or auth-gated before any production deployment.

### C.2 States that require direct DB manipulation

The API does not expose endpoints for lockout, aged-session, or OTP expiry. Use these SQL statements **on staging only**.

#### Locked-out account (TC-013) — 5+ failed attempts, active lockout

```sql
-- Produces a tier-2 (6-hour) lockout so it survives the duration of a test run
INSERT INTO login_attempt
  (id, user_id, device_fingerprint, device_type, attempt_count, lockout_count, locked_until, last_attempt_at)
SELECT UUID(), id, '127.0.0.1', 'anonymous', 5, 1,
       DATE_ADD(NOW(), INTERVAL 6 HOUR),
       NOW()
FROM user WHERE username = 'qa_baseline'
ON DUPLICATE KEY UPDATE
  attempt_count = 5,
  lockout_count = 1,
  locked_until  = DATE_ADD(NOW(), INTERVAL 6 HOUR),
  last_attempt_at = NOW();
```

Reset lockout after the test:

```sql
UPDATE login_attempt la
JOIN user u ON la.user_id = u.id
SET la.attempt_count = 0, la.locked_until = NULL
WHERE u.username = 'qa_baseline';
```

#### Aged session / expired refresh token (TC-020) — session older than 60 days

Refresh tokens are stateless JWTs; there is no token table to back-date. The workaround is to mint a token whose `exp` is already past the 60-day window and present it to `/auth/refresh`:

```python
# python produce_aged_token.py  (run on the staging server or locally with the same JWT_SECRET_KEY)
import os, jwt, datetime, uuid

secret = os.environ["JWT_SECRET_KEY"]
# exp one second in the past — already expired
old_exp = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
payload = {
    "sub": "<qa_baseline user UUID from DB>",
    "jti": str(uuid.uuid4()),
    "type": "refresh",
    "exp": old_exp,
}
token = jwt.encode(payload, secret, algorithm="HS256")
print(token)
```

Pass the output as `{"refresh_token": "<token>"}` to `POST /auth/refresh`. The server returns **401 Token has expired** — the expected result for TC-020.

#### Expired email OTP (TC-053)

After triggering `POST /auth/forgot-password/email` for `qa_email`:

```sql
UPDATE passwordresetcode
SET expires_at = DATE_SUB(NOW(), INTERVAL 11 MINUTE)
WHERE user_id = (SELECT id FROM user WHERE username = 'qa_email')
ORDER BY created_at DESC
LIMIT 1;
```

#### SMS OTP with 3 wrong attempts (TC-055)

After triggering `POST /auth/forgot-password/otp/send` for `qa_phone`:

```sql
UPDATE phone_password_reset_code
SET attempts = 3
WHERE user_id = (SELECT id FROM user WHERE username = 'qa_phone')
ORDER BY created_at DESC
LIMIT 1;
```

The next `/otp/verify` call (any code) returns **429 Too Many Attempts** — the expected result for TC-055.

#### Expired email-recovery token (TC-061)

After triggering `POST /auth/forgot-password/email-recovery/send` for `qa_email`:

```sql
UPDATE email_recovery_token
SET expires_at = DATE_SUB(NOW(), INTERVAL 31 MINUTE)
WHERE user_id = (SELECT id FROM user WHERE username = 'qa_email')
  AND used = FALSE
ORDER BY created_at DESC
LIMIT 1;
```

#### Recovery-key cooldown (TC-073)

After `qa_baseline` has generated a recovery key at least once:

```sql
-- Simulate "just generated 1 day ago" — well within the 30-day cooldown
UPDATE recoverykey
SET updated_at = DATE_SUB(NOW(), INTERVAL 1 DAY)
WHERE user_id = (SELECT id FROM user WHERE username = 'qa_baseline');
```

---

## D. Deterministic OTP Test Mode

### D.1 Current state

`generate_reset_code()` in `server/app/api/forgot_password.py` uses `secrets.randbelow(900000) + 100000`. The OTP code is:

- **Email path** (`passwordresetcode` table): stored as plaintext — readable via SQL (workaround below).
- **SMS new path** (`phone_password_reset_code` table): stored as a **SHA-256 hash** — the plaintext is never persisted and cannot be recovered from the DB.

This makes TC-051 (email OTP) partially workable via SQL and TC-054 / TC-055 (SMS OTP) unautomatable until the override is implemented.

### D.2 Proposed server change

Add an environment-variable override to `generate_reset_code()` in `server/app/api/forgot_password.py`:

```python
# server/app/api/forgot_password.py — proposed addition
import os

def generate_reset_code() -> str:
    override = os.getenv("SAPOT_TEST_OTP_CODE", "")
    if override and override.isdigit() and len(override) == 6:
        return override   # deterministic only when explicitly set
    return str(secrets.randbelow(900000) + 100000)
```

Enable on the test server:

```dotenv
# server/.env (staging / local only — never set in production)
SAPOT_TEST_OTP_CODE=123456
```

With this in place, all OTP tests can submit `123456` as the code without reading the database or waiting for real email/SMS delivery.

**Guard against accidental production use:** the function only activates the override when the env var is a non-empty 6-digit string. Omit the var (or set it to an empty string) in production `.env`.

### D.3 Workaround until the change lands

**Email OTP** — read the plaintext code from the DB after triggering the send:

```sql
SELECT code, expires_at
FROM passwordresetcode
WHERE user_id = (SELECT id FROM user WHERE username = 'qa_email')
ORDER BY created_at DESC
LIMIT 1;
```

**SMS OTP** — no workaround is possible (SHA-256 hash only). Until `SAPOT_TEST_OTP_CODE` is implemented:
- TC-054 must remain **MANUAL**.
- TC-055 uses the DB manipulation from Section C.2 (set `attempts = 3`) rather than submitting wrong codes.

---

## E. Reusable Login Fixture (Jest / RNTL)

These helpers follow the factory pattern established in `test/builders/factory.builder.ts`.

### E.1 Auth state factory — `test/fixtures/auth-state.fixture.ts`

```typescript
import { createFactory } from "../builders/factory.builder";

export interface AuthUserState {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  accessToken: string;
  refreshToken: string;
  isGuest: false;
}

export interface AuthGuestState {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  isGuest: true;
}

const STUB_ACCESS_TOKEN = "stub-access-token";
const STUB_REFRESH_TOKEN = "stub-refresh-token";

export const createAuthUserState = createFactory<AuthUserState>(() => ({
  userId: "test-user-id",
  username: "qa_baseline",
  firstName: "QA",
  lastName: "Baseline",
  accessToken: STUB_ACCESS_TOKEN,
  refreshToken: STUB_REFRESH_TOKEN,
  isGuest: false,
}));

export const createAuthGuestState = createFactory<AuthGuestState>(() => ({
  userId: "guest-test-id",
  username: "qa_guest",
  firstName: "Guest",
  lastName: "User",
  isGuest: true,
}));
```

### E.2 UserStore mock helper — `test/fixtures/user-store.fixture.ts`

```typescript
import { createAuthUserState, AuthUserState } from "./auth-state.fixture";

export function createMockUserStore(overrides?: Partial<AuthUserState>) {
  const state = createAuthUserState(overrides);
  return {
    user: {
      id: state.userId,
      username: state.username,
      firstName: state.firstName,
      lastName: state.lastName,
    },
    isGuest: false as const,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    setUser: jest.fn(),
    clearUser: jest.fn(),
  };
}

export function createMockGuestUserStore() {
  return {
    user: {
      id: "guest-id",
      username: "guest-user",
      firstName: "Guest",
      lastName: "User",
    },
    isGuest: true as const,
    accessToken: null,
    refreshToken: null,
    setUser: jest.fn(),
    clearUser: jest.fn(),
  };
}
```

### E.3 Usage in a Jest / RNTL test

```typescript
import { createMockUserStore } from "@/test/fixtures/user-store.fixture";
import { createConnectionServiceDependencyMocks } from "@/test/mocks/service.mock-builders";

describe("ChatService — authenticated user", () => {
  it("sends a message when WebRTC is connected", async () => {
    // Arrange
    const userStore = createMockUserStore({ username: "qa_baseline" });
    const deps = createConnectionServiceDependencyMocks();
    // wire userStore into your service under test ...

    // Act + Assert ...
  });
});

describe("ChatService — guest user", () => {
  it("cannot initiate a server-relay send", async () => {
    const userStore = createMockGuestUserStore();
    // ...
  });
});
```

### E.4 API-level login helper (Pytest integration tests)

```python
# server/tests/fixtures/auth.py
import os, requests

BASE_URL = os.getenv("SAPOT_TEST_BASE_URL", "http://localhost:8000")


def login(username: str, password: str) -> dict:
    """Returns the full token response dict."""
    resp = requests.post(
        f"{BASE_URL}/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def login_as_baseline() -> dict:
    return login("qa_baseline", "Baseline1")


def login_as_admin() -> dict:
    return login("qa_admin", "Admin1!xx")


def admin_bearer() -> str:
    return login_as_admin()["access_token"]
```

```python
# Example Pytest test using the fixture
from fixtures.auth import login_as_baseline

def test_refresh_rotates_token(client):
    tokens = login_as_baseline()
    resp = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    assert resp.json()["access_token"] != tokens["access_token"]
```

---

## F. Teardown & Reset

### F.1 Reset lockout for all QA accounts (between runs)

```sql
UPDATE login_attempt la
JOIN user u ON la.user_id = u.id
SET la.attempt_count = 0, la.locked_until = NULL, la.lockout_count = 0
WHERE u.username LIKE 'qa\_%';
```

### F.2 Purge all QA OTP / token records

```sql
DELETE prc FROM passwordresetcode prc
  JOIN user u ON prc.user_id = u.id WHERE u.username LIKE 'qa\_%';

DELETE pprc FROM phone_password_reset_code pprc
  JOIN user u ON pprc.user_id = u.id WHERE u.username LIKE 'qa\_%';

DELETE ert FROM email_recovery_token ert
  JOIN user u ON ert.user_id = u.id WHERE u.username LIKE 'qa\_%';

DELETE prt FROM passwordresettoken prt
  JOIN user u ON prt.user_id = u.id WHERE u.username LIKE 'qa\_%';
```

### F.3 Re-apply ban on qa_banned (after unban between runs)

```bash
ADMIN_TOKEN=$(curl -sf -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=qa_admin&password=Admin1!xx" | jq -r '.access_token')
BANNED_ID=$(curl -sf "$BASE_URL/auth/exists?identifier=qa_banned" | jq -r '.user_id')
curl -sf -X POST "$BASE_URL/admin/unban/user?user_id=$BANNED_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sf -X POST "$BASE_URL/admin/ban/user?user_id=$BANNED_ID&duration_in_days=26645" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
```

### F.4 Full teardown and re-seed (nightly CI)

```bash
#!/usr/bin/env bash
# teardown-and-reseed.sh
set -euo pipefail
BASE_URL="${SAPOT_TEST_BASE_URL:-http://localhost:8000}"

ADMIN_TOKEN=$(curl -sf -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=qa_admin&password=Admin1!xx" | jq -r '.access_token')

for USERNAME in qa_baseline qa_baseline_b qa_rescuer qa_banned qa_phone qa_email; do
  USER_ID=$(curl -sf "$BASE_URL/auth/exists?identifier=$USERNAME" | jq -r '.user_id // empty')
  if [ -n "$USER_ID" ]; then
    curl -sf -X POST "$BASE_URL/admin/delete/user?user_id=$USER_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    echo "Deleted $USERNAME"
  fi
done

bash seed-test-accounts.sh
```

> `qa_admin` is excluded from the teardown loop — it is bootstrapped once per environment and retained as the persistent admin identity for all `/admin/*` calls.
