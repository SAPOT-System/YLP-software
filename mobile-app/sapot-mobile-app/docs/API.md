# REST API Reference

## Base URL

| Environment | URL |
|---|---|
| Development | `http://<EXPO_PUBLIC_DEV_HOST>:8000` |
| Preview / Production | `https://sapot.online` |

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

**Response `201`:** (server sets `status_code=201`; previously documented here as `200`)
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

Issues a short-lived (10 min) reauth token for sensitive actions, without invalidating the current session. Not previously documented here.

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

**Request body:** (was previously documented as query params — actual route takes a JSON body)
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
`phone_verified` was missing from this response body in the previous version of this doc.

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
**Query params:** `identifier_string=<string>` (previously documented as `username`) `&limit=<number=20>&offset=<number=0>`

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

Not previously documented. Returns active, non-expired announcements filtered by the caller's role:
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
**Query params:** `last_pulled_at=<number=0>&limit=<number=100>`

`schema_version` is **not** an accepted param — it's commented out in `app/api/sync.py` (`# schema_version: int = Query(default=1)`) despite being documented here previously. Each table's change-set is paginated via `limit`; the response tells the client whether more pages remain.

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
`next_cursor`/`has_more` per table were not previously documented here — the client doesn't currently
consume them (see the note below), but they're present on every response.

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
`guest_users` (not previously documented) lets the client supply display-name hints for
not-yet-registered peers referenced by a pushed record (e.g. a P2P-only message from a guest). The
server uses these to materialize a placeholder `User`+`Guest` row instead of failing the FK.

**Response `200`:**
```json
{ "status": "ok" }
```

**Errors** (not previously documented): `409` — a referenced record was modified on the server after
the client's `last_pulled_at` (conflict; client should re-pull before retrying). `404` — the record
was already soft-deleted on the server. `500` — unhandled sync error (transaction rolled back).

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
