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

**Response `200`:**
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

### `GET /auth/exists/` — Check Identifier Exists
**Auth:** None  
**Query params:** `identifier=<username|email|phone>`

**Response `200`:**
```json
{ "exists": "boolean" }
```

---

### `POST /auth/change-password` — Change Password
**Auth:** Required  
**Query params:** `current_password=<string>&new_password=<string>`

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
  "email_verified": "boolean",
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
**Query params:** `username=<string>`

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
  ]
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
**Query params:** `last_pulled_at=<number>&schema_version=<number>`

**Response `200`:**
```json
{
  "changes":   "<PushLocalDataRequestBody.changes>",
  "timestamp": "number — Unix timestamp (ms)"
}
```

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
  }
}
```

**Response `200`:**
```json
{ "status": "ok" }
```

Conflicts are resolved server-side (server wins): a pushed record whose server copy changed after `last_pulled_at`, or that was already deleted, is skipped while the rest of the batch commits. The skipped record's `updated_at` is bumped so it is re-delivered on the next `/sync/pull`. The endpoint does not return `409`/`404` for conflicts. See `docs/SYNC.md` → Conflict Resolution.

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
