# REST API Reference

## Base URL

| Environment | URL |
|---|---|
| Development (`__DEV__`) | `https://<EXPO_PUBLIC_DEV_HOST>` |
| Preview / Production | `https://server.sapot.lan` |

Resolved by `config/runtime.ts` (`getApiUrl()`). The app always speaks HTTPS — there is
no plaintext HTTP fallback and no explicit port in the base URL. A dev/QA host override
(`setRuntimeHostOverride`, persisted via `features/shared/core/stores/secure-config.ts`)
takes precedence over both rows when set. See [ENV_CONFIG.md](ENV_CONFIG.md#api--websocket-url-resolution).

## Authentication

All protected endpoints require a JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The `apiClient` (axios instance) automatically attaches the token via an interceptor. On 401, it attempts a token refresh before retrying.

---

## Auth — `/auth`

### `POST /auth/` — Register
**Auth:** None

**Request body:**
```json
{
  "username":     "string  — required",
  "password":     "string  — required",
  "first_name":   "string  — required",
  "last_name":    "string  — required",
  "phone_number": "string? — optional",
  "email":        "string? — optional"
}
```

**Response `201`:**
```json
{
  "id":            "string",
  "username":      "string",
  "first_name":    "string",
  "last_name":     "string",
  "phone_number":  "string",
  "email":         "string",
  "access_token":  "string",
  "refresh_token": "string",
  "detail":        "string"
}
```

---

### `POST /auth/token` — Login
**Auth:** None  
**Content-Type:** `application/x-www-form-urlencoded`

**Request body:**
```
grant_type=password&username=<username>&password=<password>&scope=&client_id=&client_secret=
```

**Response `200`:**
```json
{
  "access_token":  "string",
  "refresh_token": "string",
  "token_type":    "bearer"
}
```

---

### `POST /auth/logout` — Logout
**Auth:** Required

---

### `POST /auth/refresh` — Refresh Token
**Auth:** None

**Request body:**
```json
{ "refresh_token": "string" }
```

**Response `200`:**
```json
{
  "access_token":  "string",
  "refresh_token": "string"
}
```

---

### `POST /auth/reauthenticate` — Re-authenticate (confirm password)
**Auth:** Required · Rate limit: 5/minute

Issues a short-lived (10 min) reauth token for sensitive actions, without invalidating the current session.

**Request body:**
```json
{ "current_password": "string" }
```

**Response `200`:**
```json
{ "reauth_token": "string" }
```

**Errors:** `401` — wrong password.

---

### `GET /auth/exists/` — Check Identifier Exists
**Auth:** None  
**Query params:** `identifier=<username|email|phone>`

**Response `200`:**
```json
{ "exists": "boolean" }
```

---

### `POST /auth/change-password` — Change Password
**Auth:** Required · Rate limit: 3/minute

**Request body:**
```json
{
  "current_password": "string",
  "new_password":      "string"
}
```

---

### `POST /auth/forgot-password/security-questions` — Set Security Questions
**Auth:** Bearer token (from registration flow)

**Request body:**
```json
{
  "questions": [
    { "question": "string", "answer": "string" }
  ]
}
```

---

### `GET /auth/forgot-password/security-question` — Get Security Question
**Auth:** None  
**Query params:** `identifier=<string>`

**Response `200`:**
```json
{ "question": "string" }
```

---

### `POST /auth/forgot-password/security-question/answer` — Verify Security Answer
**Auth:** None  
**Query params:** `identifier=<string>`

**Request body:**
```json
{ "question": "string", "answer": "string" }
```

**Response `200`:**
```json
{ "correct": "boolean", "reset_link": "string" }
```

---

### `GET /auth/forgot-password/reset-password` — Check Reset Token Valid
**Auth:** None  
**Query params:** `token=<string>`

**Response:** `200` if valid

---

### `POST /auth/forgot-password/reset-password` — Reset Password
**Auth:** None  
**Query params:** `token=<string>`

**Request body:**
```json
{ "new_password": "string" }
```

---

### `POST /auth/forgot-password/email` — Send Reset Email Code
**Auth:** None  
**Query params:** `email=<string>`

---

### `POST /auth/forgot-password/email-code` — Verify Email Reset Code
**Auth:** None  
**Query params:** `email=<string>&code=<string>`

**Response `200`:**
```json
{ "link": "string", "detail": "string" }
```

---

### `POST /auth/forgot-password/recovery-with-recovery-key` — Reset via Recovery Key
**Auth:** None  
**Content-Type:** `multipart/form-data`  
**Query params:** `user_identifier=<string>`  
**Body:** `key_file` (file upload)

**Response `200`:**
```json
{
  "recovery-link":     "string",
  "method":            "string",
  "expire_in_seconds": "number"
}
```

---

### `POST /auth/forgot-password/generate-new-recovery-key` — Generate Recovery Key
**Auth:** Bearer token (from registration flow)

**Response:** Plain text recovery key (`text/plain`)

---

### `POST /auth/verify/resend-verification-code` — Resend Email Verification
**Auth:** Required

**Response `200`:**
```json
{ "message": "string" }
```

---

### `POST /auth/verify/verify-code` — Verify Email Code
**Auth:** Required

**Request body:**
```json
{ "code": "string" }
```

---

### `GET /auth/terms` — Terms & Conditions Text
**Auth:** None

**Response `200`:**
```json
{ "content": "string" }
```

---

### `GET /auth/forgot-password/generate-security-question` — Suggest Security Questions
**Auth:** Bearer token (from registration flow)

Returns the server-curated question list the registration flow offers the user.

---

### `GET /auth/forgot-password/recovery-constraints` — Recovery Method Cooldowns
**Auth:** Required

Drives which recovery options the settings UI enables, and why one is greyed out.

**Response `200`:**
```json
{
  "recovery_key": {
    "has_key":               "boolean",
    "can_change":            "boolean",
    "days_since_generated":  "number | null",
    "days_until_changeable": "number | null"
  },
  "security_question": {
    "has_question":          "boolean",
    "can_change":            "boolean",
    "is_burned":             "boolean",
    "is_expired":            "boolean",
    "days_since_set":        "number | null",
    "days_until_changeable": "number | null",
    "days_until_expiry":     "number | null"
  }
}
```

---

### `POST /auth/forgot-password/phone` — Send Reset SMS Code
**Auth:** None

**Request body:**
```json
{ "phone_number": "string" }
```

---

### `POST /auth/forgot-password/phone-code` — Verify Reset SMS Code
**Auth:** None

**Request body:**
```json
{ "phone_number": "string", "code": "string" }
```

**Response `200`:**
```json
{ "link": "string", "detail": "string", "recovery_token": "string" }
```

---

### `POST /auth/forgot-password/otp/send` — Send Master-Key Recovery OTP
**Auth:** None

Distinct from `/auth/forgot-password/phone`: that one resets the *password*, this one unlocks a
wrapped *master key* blob (see [Recovery Blobs](#recovery-blobs--users)).

**Request body:**
```json
{ "phone_number": "string" }
```

---

### `POST /auth/forgot-password/otp/verify` — Verify Master-Key Recovery OTP
**Auth:** None

**Request body:**
```json
{ "phone_number": "string", "code": "string" }
```

**Response `200`:**
```json
{ "recovery_token": "string", "user_id": "string" }
```

---

### `POST /auth/forgot-password/email-recovery/send` — Send Master-Key Recovery Email
**Auth:** None · **Query params:** `email=<string>`

---

### `GET /auth/forgot-password/email-recovery/verify` — Verify Recovery Email Token
**Auth:** None · **Query params:** `t=<token>`

**Response `200`:**
```json
{ "recovery_token": "string", "user_id": "string" }
```

---

## Keys — `/keys`

Peer ECDH public-key distribution. Underpins E2E encryption on both transports — see
[ARCHITECTURE.md](ARCHITECTURE.md#encryption). Handled by
`features/shared/crypto/peer-key-service.ts`.

Some calls here use raw `fetch` with an explicit `Authorization` header rather than `apiClient`,
because they run during initialization before the axios interceptor has a token to attach.

### `POST /keys/register` — Register Own ECDH Public Key
**Auth:** Required

**Request body:**
```json
{ "ecdh_public_key": "string — base64" }
```

**Response `200`:** a server-signed credential other peers can verify offline:
```json
{
  "peer_id":         "string",
  "ecdh_public_key": "string — base64",
  "issued_at":       "number",
  "expires_at":      "number",
  "signature":       "string — base64 Ed25519"
}
```

---

### `GET /keys/{peerId}` — Fetch a Peer's Signed Credential
**Auth:** Required

Same body as `POST /keys/register`'s response. The client verifies `signature` against the
server's Ed25519 key before trusting `ecdh_public_key`; a credential that fails verification is
discarded. Registered (non-guest) peers only — guests are not server-registered.

---

### `GET /keys/{peerId}/type` — Is This Peer a Guest?
**Auth:** Required

**Response `200`:**
```json
{ "is_guest": "boolean" }
```

---

### `GET /keys/server-public-key` — Server Ed25519 Verify Key
**Auth:** None

**Response `200`:**
```json
{ "ed25519PublicKey": "string — base64" }
```

Fallback for when `EXPO_PUBLIC_SERVER_VERIFY_KEY` is not baked into the build. If neither is
available the client **skips** credential signature verification, so treat a missing verify key
as a security downgrade, not a harmless default.

---

### `POST /keys/contacts/{peerId}` — Back Up a Contact's Key
**Auth:** Required

Guest peers never appear in `/keys/{peerId}`, so their public key — learned over the TCP
handshake — would be lost on re-login. The client encrypts it under its own master key with
`nacl.secretbox` and parks the ciphertext here. The server stores an opaque blob and cannot read
the key.

**Request body:**
```json
{ "encrypted_public_key": "string — base64(nonce ‖ ciphertext)" }
```

---

### `GET /keys/contacts` — Restore Backed-Up Contact Keys
**Auth:** Required

Called on re-login / new device, before conversation keys are derived.

**Response `200`:**
```json
[ { "peer_id": "string", "encrypted_public_key": "string — base64" } ]
```

---

## Recovery Blobs — `/users`

Wrapped copies of the user's master key, one per recovery method, so the key survives a
forgotten password. The server only ever holds ciphertext.

### `POST /users/recovery-setup` — Store Wrapped Master Keys
**Auth:** Required

**Request body:**
```json
{
  "blobs": [
    { "method": "string", "wrapped_blob": "string", "metadata": "string?" }
  ]
}
```

---

### `PUT /users/recovery-keys` — Replace Wrapped Master Keys
**Auth:** Required

Same body as `POST /users/recovery-setup`. Used after a password change re-wraps the master key.

---

### `GET /users/recovery-key` — Fetch One Wrapped Blob
**Auth:** None (authorized by `recovery_token`)  
**Query params:** `recovery_token=<string>&method=<string>`

The `recovery_token` comes from a verified OTP / email / security-question challenge.

**Response `200`:**
```json
{ "wrapped_blob": "string", "metadata": "string | null", "user_id": "string" }
```

---

### `GET /users/wrapped-key` — Own Wrapped Key (existence probe)
**Auth:** Required

`LocalEncryptionService` calls this on login to decide whether a wrapped key already exists
server-side. A `200` means yes; anything else is treated as "not yet uploaded".

---

### `POST /users/wrapped-key` — Upload Own Wrapped Key
**Auth:** Required

**Request body:**
```json
{ "wrapped_blob": "string" }
```

Failure is non-fatal — the client logs and retries on next login.

---

## User — `/user-utils`

### `GET /user-utils/current-user-info/` — Get Current User
**Auth:** Required (optional override via `accessToken` param)

**Response `200`:**
```json
{
  "id":             "string",
  "username":       "string",
  "first_name":     "string",
  "last_name":      "string",
  "email":          "string",
  "phone_number":   "string",
  "email_verified":  "boolean",
  "phone_verified":  "boolean",
  "role":           "\"admin\" | \"rescuer\" | \"user\""
}
```

---

### `GET /user-utils/is-rescuer` — Check Rescuer Role
**Auth:** Required

**Response `200`:** `true` or `false`

---

### `GET /user-utils/is-admin` — Check Admin Role
**Auth:** Required

**Response `200`:** `true` or `false`

---

### `POST /user-utils/search-user` — Search Users
**Auth:** Required  
**Query params:** `identifier_string=<string>&limit=<number=20>&offset=<number=0>`

**Response `200`:**
```json
{
  "res": [
    {
      "id":              "string",
      "username":        "string",
      "first_name":      "string",
      "last_name":       "string",
      "phone_is_verified": "boolean",
      "role":            "\"admin\" | \"rescuer\" | \"user\""
    }
  ],
  "limit":  "number",
  "offset": "number"
}
```

---

### `GET /user-utils/search-user/{id}` — Get User by ID
**Auth:** Required

**Response `200`:**
```json
{
  "id":              "string",
  "username":        "string",
  "first_name":      "string",
  "last_name":       "string",
  "phone_is_verified": "boolean",
  "role":            "\"admin\" | \"rescuer\" | \"user\"",
  "last_active":     "ISO-8601 string | null",
  "status":          "\"Active\" | \"Inactive\""
}
```
`last_active` / `status` come from `UserActivity`, stamped on WS connect/disconnect (and REST
activity). The client uses `last_active` to render the "Last seen …" label for offline peers.

---

### `GET /user-utils/get-announcements` — Role-Filtered Announcements
**Auth:** Required  
**Query params:** `limit=<number=20>&offset=<number=0>`

Returns active, non-expired announcements filtered by the caller's role:
admins see all; rescuers see `rescuer` + `user`-targeted announcements; regular users see only
`user`-targeted announcements. Ordered newest first.

**Response `200`:**
```json
{
  "role":  "\"admin\" | \"rescuer\" | \"user\"",
  "count": "number",
  "announcements": [ "Announcement" ]
}
```

---

## Profile — `/update` & `/profile-picture`

### `POST /update/profile` — Update Profile
**Auth:** Required

**Request body** (all fields optional):
```json
{
  "username":     "string?",
  "first_name":   "string?",
  "last_name":    "string?",
  "phone_number": "string?",
  "email":        "string?"
}
```

---

### `POST /profile-picture/me` — Upload Profile Picture
**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Body:** `file` (image upload)

**Response `200`:**
```json
{
  "message":  "string",
  "photo_id": "string",
  "url":      "string"
}
```

---

### `GET /profile-picture/me` — Get Own Profile Picture
**Auth:** Required

**Response `200`:**
```json
{ "url": "string" }
```

---

### `GET /profile-picture/:userId` — Get User Profile Picture
**Auth:** Required

**Response `200`:**
```json
{ "url": "string" }
```

---

## Sync — `/sync`

### `GET /sync/pull` — Pull Changes from Server
**Auth:** Required  
**Query params sent by the client:** `last_pulled_at=<number>&schema_version=<number>`

`limit` is a **server-side default (100 per table)**, not something the client sends — page size
is not client-controlled.

`schema_version` is sent by `features/sync/api/sync.api.ts` but the server ignores it: the
parameter is commented out in `app/api/sync.py` (`# schema_version: int = Query(default=1)`), so
FastAPI discards it. It is preserved on the client so a future server can use it without a mobile
release.

**Response `200`:**
```json
{
  "changes": {
    "conversations":            { "created": [], "updated": [], "deleted": [], "next_cursor": "number|null", "has_more": "boolean" },
    "messages":                 { "created": [], "updated": [], "deleted": [], "next_cursor": "number|null", "has_more": "boolean" },
    "conversation_participants":{ "created": [], "updated": [], "deleted": [], "next_cursor": "number|null", "has_more": "boolean" },
    "calls":                    { "created": [], "updated": [], "deleted": [], "next_cursor": "number|null", "has_more": "boolean" },
    "call_participants":        { "created": [], "updated": [], "deleted": [], "next_cursor": "number|null", "has_more": "boolean" },
    "message_receipts":         { "created": [], "updated": [], "deleted": [], "next_cursor": "number|null", "has_more": "boolean" }
  },
  "timestamp": "number — Unix timestamp (ms)"
}
```
`next_cursor`/`has_more` are present on every table's change-set, and the client **does** page
through them: `SyncService.pullFromServer()` loops while any table reports `has_more`, advancing
the cursor to `Math.min(...next_cursor)` across those tables and merging pages by id. The loop is
bounded at 50 iterations, and stops early (with a warning) if `has_more` is true but no table
returns a usable `next_cursor`.

---

### `POST /sync/push` — Push Local Changes to Server
**Auth:** Required

**Request body:**
```json
{
  "last_pulled_at": "number?",
  "changes": {
    "conversations": {
      "created": [ { "id": "string", "title": "string|null", "conversation_type": "string", "is_deleted": "boolean", "created_at": "number", "updated_at": "number" } ],
      "updated": [ { "id": "string", "...": "partial fields" } ],
      "deleted": [ "string — id" ]
    },
    "conversation_participants": { "created": [], "updated": [], "deleted": [] },
    "messages": { "created": [], "updated": [], "deleted": [] },
    "calls": { "created": [], "updated": [], "deleted": [] },
    "call_participants": { "created": [], "updated": [], "deleted": [] },
    "message_receipts": { "created": [], "updated": [], "deleted": [] }
  },
  "guest_users": { "<user_id>": { "username": "string", "first_name": "string", "last_name": "string" } }
}
```
`guest_users` lets the client supply display-name hints for
not-yet-registered peers referenced by a pushed record (e.g. a P2P-only message from a guest). The
server uses these to materialize a placeholder `User`+`Guest` row instead of failing the FK.

**Response `200`:**
```json
{ "status": "ok" }
```

**Errors:** `409` — a referenced record was modified on the server after
the client's `last_pulled_at` (conflict; client should re-pull before retrying). `404` — the record
was already soft-deleted on the server. `500` — unhandled sync error (transaction rolled back).

---

## Public Chat — `/public-chat`

Server-relayed broadcast channel, separate from P2P chat. History over REST; live messages arrive
over the signaling WebSocket (see [CONNECTION_MESSAGES.md](CONNECTION_MESSAGES.md)).

### `GET /public-chat` — Message History
**Auth:** Required  
**Query params:** `limit=<number>&before=<number?>` — `before` is an epoch-ms cursor for paging backwards.

**Response `200`:**
```json
{
  "messages": [
    {
      "id":                 "string",
      "content":            "string",
      "is_deleted":         "boolean",
      "sender_id":          "string",
      "sender_first_name":  "string | null",
      "sender_last_name":   "string | null",
      "sender_username":    "string | null",
      "created_at":         "number — Unix ms"
    }
  ],
  "limit":             "number",
  "oldest_created_at": "number | null"
}
```

Page backwards by passing the previous response's `oldest_created_at` as `before`; `null` means
the start of history has been reached.

---

## GPS — `/gps`

Location history and last-known positions for the map screen. Live streaming does **not** go
through REST — it uses a dedicated WebSocket (`/gps/ws/<userId>`), independent of
`ConnectionService`.

### `GET /gps/latest` — Latest Location Per User
**Auth:** Required

**Response `200`:**
```json
[
  {
    "user_id":   "string",
    "latitude":  "number",
    "longitude": "number",
    "timestamp": "ISO-8601 string",
    "username":  "string",
    "role":      "\"admin\" | \"rescuer\" | \"user\"  — optional; drives the map marker"
  }
]
```

---

### `GET /gps/history/{userId}` — Location History for One User
**Auth:** Required  
**Query params:** `limit=<number=50>`

**Response `200`:**
```json
[
  {
    "id":        "number",
    "user_id":   "string",
    "latitude":  "number",
    "longitude": "number",
    "timestamp": "ISO-8601 string"
  }
]
```

Note `id` is a **number** here, unlike the string UUIDs used elsewhere in this API.

---

## SMS Gateway — `/gsm`

Proxies the GSM module (`GSM-module/GSM-fastapi/`) for phone verification and for reaching people
who are not on the LAN. The API server forwards to the GSM service; the handset never talks to it
directly.

### `GET /gsm/health` — GSM Module Health
**Auth:** Required

**Response `200`:**
```json
{ "status": "string", "gsm_ready": "boolean", "connected": "boolean", "detail": "string" }
```

The server preserves the gateway's HTTP 503 status when the modem is not ready. Callers treat that response as unavailable rather than relying only on the JSON status field.

`gsm_ready` (modem registered on the network) and `connected` (API can reach the GSM service) fail
independently — surface them separately rather than collapsing to one "offline" state.

---

### `POST /gsm/sms/send` — Send SMS to a Known User
**Auth:** Required  
**Query params:** `user_id=<string>&message=<string>` (query params, not a JSON body)

**Response `200`:**
```json
{ "msg_id": "string", "ok": "boolean", "to": "string" }
```

**Response `503` when the outbound queue is full:**
```json
{
  "detail": {
    "message": "Outbound SMS queue is full",
    "reason": "QUEUE_FULL",
    "msg_id": "string"
  }
}
```

The chat screen marks the local message `not_sent`, shows that the SMS service is busy, and keeps the manual resend action available.

---

### `POST /gsm/contact-unknown-user` — SMS an Arbitrary Number
**Auth:** Required  
**Query params:** `target_phone_number=<string>`

**Response `200`:**
```json
{
  "status":        "string",
  "detail":        "string",
  "user_id":       "string",
  "is_sapot_user": "boolean"
}
```

`is_sapot_user` reports whether the number already belongs to a registered account.
If the onboarding SMS is rejected, the endpoint preserves the gateway error and the app does not display its success confirmation.

---

### `POST /gsm/verify` — Verify Phone Code
**Auth:** Required

**Request body:**
```json
{ "code": "string" }
```

---

### `POST /gsm/resend` — Resend Phone Verification Code
**Auth:** Required

**Response `200`:**
```json
{ "message": "string" }
```

Phone verification request and resend calls preserve HTTP 503 gateway failures. The verification screen remains retryable and displays a busy or unavailable message.

---

### `POST /gsm/migrate-phone-user` — Claim a Ghost Phone Account
**Auth:** Required

Merges a "ghost" record — created when someone was SMS'd before registering — into the calling
user's account.

**Response `200`:**
```json
{ "migrated": "boolean", "ghost_user_id": "string?", "detail": "string?" }
```

---

## Tile Server — separate deployment

Map tiles are **not** served by the API. `getTileServerUrl()` resolves a separate origin
(`<host>/tiles`, see [ENV_CONFIG.md](ENV_CONFIG.md#api--websocket-url-resolution)), so the
tileserver can be down while the API is healthy.

| Path | Purpose |
|---|---|
| `GET /styles/basic-preview/style.json` | Reachability probe (`checkTileServerReachable`). Probed instead of a tile because it is always present, whereas a given `{z}/{x}/{y}` depends on the loaded mbtiles. |
| `GET /styles/basic-preview/{z}/{x}/{y}.png` | Raster basemap tiles rendered by MapLibre. |

The probe never throws — a failure is reported as `false`. MapLibre swallows tile fetch errors and
exposes no error event, so this probe is the only way to tell the user their basemap is missing.

---

## Debug / QA — `/testing`

Only reachable when the server runs with `ENVIRONMENT=development`. Gated in the app behind
`config/debug.ts`.

### `POST /testing/login-as/{handle}` — Log In as a Seeded Fixture
**Auth:** `X-QA-Token` header, from `EXPO_PUBLIC_QA_API_TOKEN`; must match the server's `QA_API_TOKEN`

Mints tokens for a seeded `qa_*` fixture account instead of registering a new user. Same response
shape as `POST /auth/`.

---

## Utility — `/` & `/ping`

### `GET /` — Health Check
**Auth:** None  
**Response:** `200` if server is up

### `GET /ping` — Ping (Latency Check)
**Auth:** None

**Response `200`:**
```json
{ "status": "string", "timestamp": "number — server Unix timestamp (ms)" }
```

The client computes latency as `Date.now() - timestamp`.
