# API Test Cases — SAPOT Backend (FastAPI)

Generated: 2026-06-20  
Framework: Pytest + FastAPI TestClient  
Format: ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate

---

## Auth Setup

All tests requiring authentication use a `valid_user_token` fixture that:
1. Creates a test user via `POST /auth/`
2. Returns the `access_token` from the response
3. Includes the token as `Authorization: Bearer <token>`

Admin tests seed the DB directly (do not rely on the unauthenticated `/testing/*` endpoints — those are the bug under test).

---

## 1. Root & Health

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-001 | GET `/` | Server running | No auth | 200 `{"state": "running"}` | P0 | Critical | Pytest |
| API-002 | GET `/auth/` | Auth health check | No auth | 200 | P1 | High | Pytest |

---

## 2. Registration & Login

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-010 | POST `/auth/` | Valid registration, terms accepted | `{username, firstName, lastName, password, terms_accepted: true}` | 200 `UserPublic` + access + refresh tokens | P0 | Critical | Pytest |
| API-011 | POST `/auth/` | terms_accepted is false | `{..., terms_accepted: false}` | 400 | P0 | Critical | Pytest |
| API-012 | POST `/auth/` | Duplicate username | Same username as existing | 409 | P0 | Critical | Pytest |
| API-013 | POST `/auth/` | Duplicate email | Same email as existing | 409 | P0 | Critical | Pytest |
| API-014 | POST `/auth/` | Password exactly 8 chars | `{password: "12345678"}` | 200 | P1 | High | Pytest |
| API-015 | POST `/auth/` | Password 7 chars | `{password: "1234567"}` | 422 | P1 | High | Pytest |
| API-016 | POST `/auth/token` | Valid credentials | `username=x&password=y` (OAuth2 form) | 200 `{access_token, refresh_token, token_type}` | P0 | Critical | Pytest |
| API-017 | POST `/auth/token` | Wrong password | `username=x&password=wrong` | 401 | P0 | Critical | Pytest |
| API-018 | POST `/auth/token` | Non-existent username | `username=unknown&password=x` | 401 (generic — not "user not found") | P0 | Critical | Pytest |
| API-019 | POST `/auth/token` | Banned user | Valid creds, banned account | 403 | P0 | Critical | Pytest |
| API-020 | POST `/auth/token` | Rate limit (5/min) | 6 requests in 1 min | 429 on 6th | P0 | Critical | Pytest |
| API-021 | POST `/auth/token` | Account locked after repeated failures | Multiple wrong passwords | 429 with `lockedUntil` | P0 | Critical | Pytest |
| API-022 | POST `/auth/logout` | Valid token | Bearer token | 200; JTI blacklisted | P0 | Critical | Pytest |
| API-023 | POST `/auth/logout` | Already blacklisted token | Reuse token after logout | 401 | P0 | Critical | Pytest |
| API-024 | POST `/auth/refresh` | Valid refresh token | `{refresh_token: valid}` | 200 new `Token`; old refresh JTI blacklisted | P0 | Critical | Pytest |
| API-025 | POST `/auth/refresh` | Invalid refresh token | `{refresh_token: "bad"}` | 401 | P0 | Critical | Pytest |
| API-026 | POST `/auth/refresh` | Revoked refresh token (already used) | Used token | 401 | P0 | Critical | Pytest |
| API-027 | POST `/auth/refresh` | Rate limit (10/min) | 11 requests/min | 429 | P1 | High | Pytest |
| API-028 | GET `/auth/exists` | Username exists | `?identifier=existing_user` | 200 `{exists: true}` | P1 | High | Pytest |
| API-029 | GET `/auth/exists` | Username does not exist | `?identifier=ghost` | 200 `{exists: false}` | P1 | High | Pytest |
| API-030 | GET `/auth/terms` | Get T&C | No auth | 200 `{content: string}` | P2 | Medium | Pytest |
| API-031 | POST `/auth/reauthenticate` | Correct current password | Bearer + `{current_password}` | 200 `{reauth_token}` | P0 | Critical | Pytest |
| API-032 | POST `/auth/reauthenticate` | Wrong password | Bearer + wrong password | 401 | P0 | Critical | Pytest |
| API-033 | POST `/auth/change-password` | Valid old + new password | Bearer + `{current_password, new_password}` | 200 | P0 | Critical | Pytest |
| API-034 | POST `/auth/change-password` | Wrong current password | Bearer + wrong old password | 401 | P0 | Critical | Pytest |
| API-035 | POST `/auth/change-password` | New password too short | `{new_password: "short"}` | 422 | P1 | High | Pytest |
| API-036 | POST `/auth/change-password` | Rate limit (3/min) | 4 requests in 1 min | 429 | P1 | High | Pytest |

---

## 3. Email Verification

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-040 | POST `/auth/verify/verify-code` | Valid code | `{code: valid_code}` | 200; `email_verified=True` set on user | P0 | Critical | Pytest |
| API-041 | POST `/auth/verify/verify-code` | Expired code | Old code | 400 | P0 | Critical | Pytest |
| API-042 | POST `/auth/verify/verify-code` | Invalid code | `{code: "000000"}` | 400 | P0 | Critical | Pytest |
| API-043 | POST `/auth/verify/resend-verification-code` | Resend without new email | Bearer | 200; new code sent | P1 | High | Pytest |
| API-044 | POST `/auth/verify/resend-verification-code` | Change email without reauth header | Bearer + `?email=new@x.com` (no X-Reauth-Token) | 401 | P0 | Critical | Pytest |
| API-045 | POST `/auth/verify/resend-verification-code` | Change email with valid reauth | Bearer + `?email=new@x.com` + valid reauth token | 200 | P0 | Critical | Pytest |

---

## 4. Forgot Password

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-050 | POST `/auth/forgot-password/email` | Known email | `?email=known@x.com` | 200 generic success | P0 | Critical | Pytest |
| API-051 | POST `/auth/forgot-password/email` | Unknown email (enumeration protection) | `?email=ghost@x.com` | 200 generic success (NOT 404) | P0 | Critical | Pytest |
| API-052 | POST `/auth/forgot-password/email-code` | Valid OTP | `?email=x&code=valid` | 200 `{link, recovery_token}` | P0 | Critical | Pytest |
| API-053 | POST `/auth/forgot-password/email-code` | Invalid OTP | Wrong code | 400 | P0 | Critical | Pytest |
| API-054 | POST `/auth/forgot-password/email-code` | Expired OTP (>10 min) | Old code | 400 | P0 | Critical | Pytest |
| API-055 | POST `/auth/forgot-password/email-code` | Rate limit (10/min) | 11 requests/min | 429 | P1 | High | Pytest |
| API-056 | POST `/auth/forgot-password/phone` | Known phone | `{phone_number: "+63912..."}` | 200 generic success | P0 | Critical | Pytest |
| API-057 | POST `/auth/forgot-password/phone-code` | Valid OTP | `{phone_number, code}` | 200 `{link, recovery_token}` | P0 | Critical | Pytest |
| API-058 | POST `/auth/forgot-password/phone-code` | 3 wrong OTPs triggers lock | 3x wrong code | 429 after 3rd | P0 | Critical | Pytest |
| API-059 | GET `/auth/forgot-password/reset-password` | Valid token | `?token=valid` | 200 `{user_id}` | P0 | Critical | Pytest |
| API-060 | GET `/auth/forgot-password/reset-password` | Expired token | Old token | 400 | P0 | Critical | Pytest |
| API-061 | POST `/auth/forgot-password/reset-password` | Valid reset | `?token=valid` + `{new_password}` | 200 | P0 | Critical | Pytest |
| API-062 | POST `/auth/forgot-password/reset-password` | Short new password | `{new_password: "short"}` | 400 | P1 | High | Pytest |
| API-063 | POST `/auth/forgot-password/recovery-with-recovery-key` | Valid key file | `?user_identifier=x` + valid file | 200 `{recovery-link, recovery_token}` | P0 | Critical | Pytest |
| API-064 | POST `/auth/forgot-password/recovery-with-recovery-key` | File too short (<20 chars) | Short file content | 400 | P0 | Critical | Pytest |
| API-065 | POST `/auth/forgot-password/recovery-with-recovery-key` | Wrong file type (binary) | PDF file | 400 | P1 | High | Pytest |
| API-066 | GET `/auth/forgot-password/security-question` | User has questions set | `?identifier=username` | 200 `{question: string}` | P0 | Critical | Pytest |
| API-067 | GET `/auth/forgot-password/security-question` | User has no questions | `?identifier=user-no-q` | 404 | P0 | Critical | Pytest |
| API-068 | POST `/auth/forgot-password/security-question/answer` | Correct answer | `{question, answer: correct}` | 200 `{correct: true, reset_link, recovery_token}` | P0 | Critical | Pytest |
| API-069 | POST `/auth/forgot-password/security-question/answer` | Wrong answer | `{question, answer: wrong}` | 200 `{correct: false}` (not 401) | P0 | Critical | Pytest |
| API-070 | POST `/auth/forgot-password/generate-new-recovery-key` | Valid password, not in cooldown | Bearer + `X-Current-Password` header | 200 file download | P0 | Critical | Pytest |
| API-071 | POST `/auth/forgot-password/generate-new-recovery-key` | Within cooldown (30-day) | Key generated < 30 days ago | 429 | P0 | Critical | Pytest |
| API-072 | POST `/auth/forgot-password/generate-new-recovery-key` | Wrong password | Wrong `X-Current-Password` | 401 | P0 | Critical | Pytest |
| API-073 | POST `/auth/forgot-password/security-questions` | Set valid questions | Bearer + `{questions: [{q, a}]}` | 200 | P0 | Critical | Pytest |
| API-074 | POST `/auth/forgot-password/security-questions` | Empty questions array | `{questions: []}` | 422 | P0 | Critical | Pytest |
| API-075 | POST `/auth/forgot-password/security-questions` | Within 90-day cooldown | Changed < 90 days ago | 429 | P1 | High | Pytest |

---

## 5. User Utilities

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-080 | GET `/user-utils/current-user-info` | Get own profile | Bearer | 200 `UserInfo` with role | P0 | Critical | Pytest |
| API-081 | GET `/user-utils/current-user-info` | Unauthenticated | No token | 401 | P0 | Critical | Pytest |
| API-082 | POST `/user-utils/search-user` | Search by substring | `?identifier_string=user` | 200 `{res: [...]}` case-insensitive | P1 | High | Pytest |
| API-083 | GET `/user-utils/search-user/{id}` | Valid UUID | Path `user_id=valid-uuid` | 200 user info | P1 | High | Pytest |
| API-084 | GET `/user-utils/search-user/{id}` | Invalid UUID | `user_id=not-a-uuid` | 404 | P1 | High | Pytest |
| API-085 | GET `/user-utils/is-admin` | Non-admin | Bearer (user role) | 200 `false` | P1 | High | Pytest |
| API-086 | GET `/user-utils/is-rescuer` | Rescuer | Bearer (rescuer) | 200 `true` | P1 | High | Pytest |
| API-087 | GET `/user-utils/get-announcements` | Regular user — user-only | Bearer (user) | 200 `user` audience only | P1 | High | Pytest |
| API-088 | GET `/user-utils/get-announcements` | Rescuer — sees more | Bearer (rescuer) | 200 rescuer + user audience | P1 | High | Pytest |
| API-089 | GET `/user-utils/get-announcements` | Expired excluded | Some expired announcements | 200 excludes expired | P0 | Critical | Pytest |

---

## 6. ECDH Keys

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-100 | POST `/keys/register` | Valid 32-byte base64 key | Bearer + `{ecdh_public_key: valid_b64}` | 200 `SignedCredential` (Ed25519-signed) | P0 | Critical | Pytest |
| API-101 | POST `/keys/register` | Invalid base64 | `{ecdh_public_key: "!!! bad"}` | 422 | P0 | Critical | Pytest |
| API-102 | POST `/keys/register` | Wrong key length (31 bytes) | 31-byte b64 | 422 | P0 | Critical | Pytest |
| API-103 | POST `/keys/register` | Replace existing key | Register twice | 200; new credential | P0 | Critical | Pytest |
| API-104 | GET `/keys/server-public-key` | Get server Ed25519 key | No auth | 200 `{ed25519PublicKey}` | P0 | Critical | Pytest |
| API-105 | GET `/keys/{peer_id}` | Peer has registered key | Bearer + valid UUID | 200 `SignedCredential` | P0 | Critical | Pytest |
| API-106 | GET `/keys/{peer_id}` | Peer has no key | Bearer + UUID with no key | 404 | P0 | Critical | Pytest |
| API-107 | GET `/keys/{peer_id}/type` | Guest peer | Bearer + guest UUID | 200 `{is_guest: true}` | P1 | High | Pytest |
| API-108 | POST `/keys/contacts/{peer_id}` | Store encrypted contact key | Bearer + `{encrypted_public_key: blob}` | 200 | P1 | High | Pytest |
| API-109 | GET `/keys/contacts` | Get all backed-up keys | Bearer | 200 list of `{peer_id, encrypted_public_key}` | P1 | High | Pytest |

---

## 7. Wrapped Key & Recovery

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-110 | POST `/users/wrapped-key` | Store wrapped key | Bearer + `{wrapped_blob: string}` | 200 | P0 | Critical | Pytest |
| API-111 | GET `/users/wrapped-key` | Get existing key | Bearer (key stored) | 200 `{wrapped_blob, created_at}` | P0 | Critical | Pytest |
| API-112 | GET `/users/wrapped-key` | No key stored | Bearer (no prior POST) | 404 | P0 | Critical | Pytest |
| API-113 | PUT `/users/wrapped-key` | Update existing key | Bearer + new blob | 200 | P0 | Critical | Pytest |
| API-114 | PUT `/users/wrapped-key` | Update non-existent | Bearer (no prior POST) | 404 | P0 | Critical | Pytest |
| API-115 | POST `/users/recovery-setup` | Bulk upsert recovery blobs | Bearer + `{blobs: [{method, wrapped_blob}]}` | 200 | P0 | Critical | Pytest |
| API-116 | GET `/users/recovery-key` | Get blob with valid recovery token | `?recovery_token=valid&method=password` | 200 `{wrapped_blob, metadata, user_id}` | P0 | Critical | Pytest |
| API-117 | GET `/users/recovery-key` | Invalid recovery token | `?recovery_token=bad` | 404 | P0 | Critical | Pytest |

---

## 8. Profile Picture

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-120 | POST `/profile-picture/me` | Upload JPEG | Bearer + multipart JPEG | 200 `{photo_id, url}` | P1 | High | Pytest |
| API-121 | POST `/profile-picture/me` | Upload PNG | Bearer + multipart PNG | 200 | P1 | High | Pytest |
| API-122 | POST `/profile-picture/me` | Upload PDF (unsupported) | Bearer + PDF | 400 | P1 | High | Pytest |
| API-123 | GET `/profile-picture/me` | Get own photo | Bearer | 200 `{url}` | P1 | High | Pytest |
| API-124 | GET `/profile-picture/me` | No photo uploaded | Bearer, no upload | 200 `{url: /static/default.jpg}` | P1 | High | Pytest |
| API-125 | GET `/profile-picture/{user_id}` | Get any user photo | No auth + valid user_id | 200 `{url}` | P1 | High | Pytest |
| API-126 | GET `/profile-picture/{user_id}` | No photo → default | No auth | 200 `{url: /static/default.jpg}` | P2 | Medium | Pytest |

---

## 9. Update Profile

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-130 | POST `/update/profile/` | Update first name | Bearer + `{firstName: "New"}` | 200 `{status: "ok"}` | P1 | High | Pytest |
| API-131 | POST `/update/profile/` | Email field silently skipped | Bearer + `{email: "new@x.com"}` | 200 but email NOT changed | P0 | Critical | Pytest |
| API-132 | POST `/update/profile/` | Phone field silently skipped | Bearer + `{phone_number: "+63912..."}` | 200 but phone NOT changed | P0 | Critical | Pytest |
| API-133 | POST `/update/profile/` | Conflict on username | Bearer + taken username | 409 | P1 | High | Pytest |

---

## 10. Sync (WatermelonDB Protocol)

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-140 | GET `/sync/pull` | Full sync (last_pulled_at=0) | Bearer + `?last_pulled_at=0` | 200 `{changes, timestamp}` all owned data | P0 | Critical | Pytest |
| API-141 | GET `/sync/pull` | Incremental sync | Bearer + `?last_pulled_at=<recent_ts>` | 200 only data changed since timestamp | P0 | Critical | Pytest |
| API-142 | GET `/sync/pull` | Only returns own data | Two users; bearer = user A | 200 excludes user B's private conversations | P0 | Critical | Pytest |
| API-143 | GET `/sync/pull` | Respects limit param | `?limit=5` | 200 at most 5 items per collection | P1 | High | Pytest |
| API-144 | GET `/sync/pull` | Unauthenticated | No token | 401 | P0 | Critical | Pytest |
| API-145 | POST `/sync/push` | Valid push payload | Bearer + valid `PushSyncRequest` | 200 `{status: "ok"}` | P0 | Critical | Pytest |
| API-146 | POST `/sync/push` | Conflict: old updated_at | Push with stale `updated_at` vs server | 409 | P0 | Critical | Pytest |
| API-147 | POST `/sync/push` | Unknown sender_id auto-creates guest | Message with unknown sender UUID | 200; guest user created | P1 | High | Pytest |
| API-148 | POST `/sync/push` | Receipt for missing message skipped | Push receipt with no parent | 200 (not error) | P1 | High | Pytest |
| API-149 | POST `/sync/push` | Empty payload | `{created: {}, updated: {}, deleted: {}}` | 200 | P1 | High | Pytest |

---

## 11. GPS

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-150 | WS `/gps/ws/{user_id}` | Auth matches user_id | Protocols `["sapot.jwt", own_token]` + own user_id | Connected with `sapot.jwt`; location saved on message | P0 | Critical | Pytest |
| API-151 | WS `/gps/ws/{user_id}` | Auth mismatch (spoofing) | Protocols `["sapot.jwt", user_a_token]` + user_b_id | Close 1008 | P0 | Critical | Pytest |
| API-152 | WS `/gps/ws/{user_id}` | Stream valid coordinates | `{"lat": 14.5, "lng": 121.0}` | Saved to DB; broadcast to monitors | P0 | Critical | Pytest |
| API-153 | WS `/gps/ws/{user_id}` | Stream invalid coords | `{"lat": "bad", "lng": null}` | Handled gracefully (not crash) | P1 | High | Pytest |
| API-154 | GET `/gps/latest` | Rescuer gets latest | Bearer (rescuer) | 200 list of `{user_id, lat, lng, timestamp}` | P0 | Critical | Pytest |
| API-155 | GET `/gps/latest` | Regular user blocked | Bearer (non-rescuer) | 403 | P0 | Critical | Pytest |
| API-156 | GET `/gps/history/{user_id}` | Valid history | Bearer (rescuer) | 200 list of locations | P1 | High | Pytest |
| API-157 | GET `/gps/history/{user_id}` | No history | Bearer (rescuer) + user with no GPS | 404 | P1 | High | Pytest |
| API-158 | WS `/gps/ws/monitor/rescuers/{id}` | Missing or non-rescuer auth | No protocols or non-rescuer JWT | Close 1008 | P0 | Critical | Pytest |
| API-159 | WS `/gps/ws/monitor/rescuers/{id}` | Valid rescuer auth | Protocols `["sapot.jwt", rescuer_token]` + matching ID | Connected with `sapot.jwt` selected | P0 | Critical | Pytest |

---

## 12. WebSocket Signaling

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-160 | WS `/ws/` | Connect with valid access token | Protocols `["sapot.jwt", valid_token]`; token-free URL | Connected with `sapot.jwt`; online status broadcast | P0 | Critical | Pytest |
| API-161 | WS `/ws/` | Connect with expired token | Protocols `["sapot.jwt", expired_token]` | Close 1008 | P0 | Critical | Pytest |
| API-162 | WS `/ws/` | Connect without protocols | No subprotocol offer | Close 1008 | P0 | Critical | Pytest |
| API-163 | WS `/ws/` | Ping → pong | `{type: "ping"}` | `{type: "pong"}` | P0 | Critical | Pytest |
| API-164 | WS `/ws/` | Get active users | `{type: "get-active-users"}` | List of connected user UUIDs | P1 | High | Pytest |
| API-165 | WS `/ws/` | Chat to online peer | `{type: "chat", data: {to: online_peer}}` | Peer receives; no server-ack | P0 | Critical | Pytest |
| API-166 | WS `/ws/` | Chat to offline peer | `{type: "chat", data: {to: offline_peer}}` | Message queued; sender gets `server-ack` | P0 | Critical | Pytest |
| API-167 | WS `/ws/` | ACK deletes queued message | `{type: "ack", data: {messageId: x}}` | Queue entry deleted | P0 | Critical | Pytest |
| API-168 | WS `/ws/` | Public-chat message | `{type: "public-chat", data: {...}}` | Saved to DB; broadcast to all | P0 | Critical | Pytest |
| API-169 | WS `/ws/` | WebRTC offer relay | `{type: "offer", data: {to: peer_id}}` | Relayed to peer | P0 | Critical | Pytest |
| API-170 | WS `/ws/` | WebRTC answer relay | `{type: "answer", data: {to: peer_id}}` | Relayed to peer | P0 | Critical | Pytest |
| API-171 | WS `/ws/` | ICE candidate relay | `{type: "ICE", data: {to: peer_id}}` | Relayed to peer | P0 | Critical | Pytest |
| API-172 | WS `/ws/` | Disconnect broadcasts offline | Client disconnects | `{type: "status-update", status: "offline"}` broadcast | P0 | Critical | Pytest |
| API-173 | WS `/ws/` | Queued messages drained on connect | Messages in queue | All delivered immediately on connect | P0 | Critical | Pytest |
| API-174 | WS `/ws/` | Stale ACK-type entries deleted on drain | ACK in queue | Deleted without delivery | P1 | High | Pytest |
| API-175 | WS `/ws/` | Seen-type delivered then deleted | Seen in queue | Delivered then removed | P1 | High | Pytest |
| API-176 | WS `/ws/` | Ambiguous subprotocol offer | Missing marker/token, reversed order, or extra protocol | Close 1008 | P0 | Critical | Pytest |
| API-177 | WS `/ws/` | Query-token downgrade attempt | Query token alone or combined with valid subprotocols | Close 1008 | P0 | Critical | Pytest |

---

## 13. Admin

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-180 | POST `/admin/login` | Admin login | Admin credentials | 200 with tokens | P0 | Critical | Pytest |
| API-181 | POST `/admin/login` | Non-admin | Regular user creds | 401 | P0 | Critical | Pytest |
| API-182 | GET `/admin/get-active-users` | Admin sees counts | Admin token | 200 `{active_users, total_users, inactive_users}` | P1 | High | Pytest |
| API-183 | POST `/admin/create/user/rescuer` | Promote to rescuer | Admin + `?user_id=uuid` | 200 | P0 | Critical | Pytest |
| API-184 | POST `/admin/create/user/rescuer` | Already rescuer | Admin + rescuer UUID | 403 | P0 | Critical | Pytest |
| API-185 | POST `/admin/remove/user/rescuer` | Demote rescuer | Admin + rescuer UUID | 200 | P0 | Critical | Pytest |
| API-186 | POST `/admin/ban/user` | Ban user 7 days | Admin + `?user_id=x&duration_in_days=7` | 200 | P0 | Critical | Pytest |
| API-187 | POST `/admin/ban/user` | Negative duration | `?duration_in_days=-1` | 422 | P2 | Medium | Pytest |
| API-188 | POST `/admin/unban/user` | Unban user | Admin + `?user_id=x` | 200 | P0 | Critical | Pytest |
| API-189 | POST `/admin/delete/user` | Hard delete | Admin + `?user_id=x` | 200 | P0 | Critical | Pytest |
| API-190 | POST `/admin/post-announcement` | Create announcement | Admin + query params (title, content, priority, target_audience, expires_at) | 200 `{announcement}` | P1 | High | Pytest |
| API-191 | PATCH `/admin/announcements/{id}` | Partial update | Admin + update params | 200 | P1 | High | Pytest |
| API-192 | DELETE `/admin/announcements/{id}` | Delete | Admin token | 200 | P1 | High | Pytest |
| API-193 | GET `/admin` | Regular user blocked | Bearer (user) | 401 | P0 | Critical | Pytest |
| API-194 | GET `/admin` | Rescuer blocked from admin | Bearer (rescuer) | 401 | P0 | Critical | Pytest |

---

## 14. GSM / SMS

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-200 | POST `/gsm/request` | Request phone verification OTP | Bearer + unverified phone | 200 `{detail}` | P1 | High | Pytest |
| API-201 | POST `/gsm/verify` | Valid OTP | Bearer + `{code: valid}` | 200; phone marked verified on user | P0 | Critical | Pytest |
| API-202 | POST `/gsm/verify` | Invalid OTP | `{code: wrong}` | 400 | P0 | Critical | Pytest |
| API-203 | POST `/gsm/verify` | Expired OTP | Old code | 400 | P0 | Critical | Pytest |
| API-204 | GET `/gsm/phone-is-verified` | Check status | Bearer | 200 `{is_verified: bool}` | P1 | High | Pytest |
| API-205 | POST `/gsm/contact-unknown-user` | Valid PH number | Bearer + `?target_phone_number=+63912...` | 200 `{status, user_id, is_sapot_user}` | P1 | High | Pytest |
| API-206 | POST `/gsm/contact-unknown-user` | Invalid format | `?target_phone_number=0917...` (not +63) | 422 | P1 | High | Pytest |
| API-207 | POST `/gsm/migrate-phone-user` | Migrate ghost | Bearer (user with phone, ghost exists) | 200 `{migrated: true}` | P0 | Critical | Pytest |
| API-208 | POST `/gsm/migrate-phone-user` | No phone on account | Bearer (no phone) | 400 | P1 | High | Pytest |
| API-209 | POST `/gsm/sms/send` | Send to banned user | Bearer + banned user_id | 403 | P0 | Critical | Pytest |

---

## 15. Security — Critical Issues

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-220 | POST `/testing/test-make-admin` | Unauthenticated privilege escalation (CRITICAL BUG) | No token + `?username=any_user` | Currently 200 — MUST be 404 or removed | P0 | Critical | Pytest |
| API-221 | POST `/testing/test-make-rescuer` | Unauthenticated privilege escalation (CRITICAL BUG) | No token + `?username=any_user` | Currently 200 — MUST be 404 or removed | P0 | Critical | Pytest |
| API-222 | GET `/auth/exists` | No rate limit enables enumeration | 100 requests without throttle | Should 429 after threshold | P0 | Critical | Pytest |
| API-223 | WS `/gps/ws/monitor/rescuers/{id}` | No auth on GPS monitor (CRITICAL BUG) | No token | Should 1008 (currently open) | P0 | Critical | Pytest |
| API-224 | POST `/portal/api/v1/guests/{id}/disconnect` | NameError crash (BUG) | Valid session_id | Currently 500 (db vs session variable) | P0 | Critical | Pytest |
| API-225 | Any | CORS `allow_origins=["*"]` + credentials | `Origin: https://evil.com` | Credentials not returned by browser | P0 | Critical | Manual |
| API-226 | POST `/auth/token` | Hardcoded JWT secret in production | JWT decode with known fallback secret | Should fail (env var must be set) | P0 | Critical | Manual |

---

## 16. Public Chat

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-230 | GET `/public-chat` | Paginated history | Bearer + `?limit=10` | 200 `{messages: [...], oldest_created_at}` | P1 | High | Pytest |
| API-231 | GET `/public-chat` | Cursor pagination | Bearer + `?before=<epoch_ms>` | 200 messages older than cursor | P1 | High | Pytest |
| API-232 | GET `/public-chat` | Unauthenticated | No token | 401 | P0 | Critical | Pytest |

---

## 17. Authorization Boundaries

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-240 | GET `/gps/latest` | User (non-rescuer) tries rescuer endpoint | Bearer (user) | 403 | P0 | Critical | Pytest |
| API-241 | GET `/admin/get-active-users` | Regular user tries admin | Bearer (user) | 401 | P0 | Critical | Pytest |
| API-242 | GET `/admin/get-active-users` | Rescuer tries admin | Bearer (rescuer) | 401 | P0 | Critical | Pytest |
| API-243 | GET `/sync/pull` | User only gets own data | Two users; request as user A | 200 excludes user B's private data | P0 | Critical | Pytest |
| API-244 | POST `/gsm/inbound` | Without GSM secret header | No `X-GSM-Secret` | 403 | P0 | Critical | Pytest |
| API-245 | GET `/gsm/users/by-phone/{phone}` | Without GSM secret header | No header | 403 | P0 | Critical | Pytest |
| API-246 | GET `/admin/router/health/latest` | Non-admin | Bearer (user) | 401 | P1 | High | Pytest |

---

## 18. Captive Portal

| ID | Endpoint | Scenario | Request | Expected Response | Priority | Severity | Automate |
|----|----------|----------|---------|-------------------|----------|----------|----------|
| API-250 | POST `/portal/api/v1/guests` | Create guest session | `GuestLoginRequest` | 200 `GuestSessionRead` | P1 | High | Pytest |
| API-251 | POST `/portal/api/v1/guests` | Idempotent on duplicate session_id | Same session_id twice | 200; existing session returned | P1 | High | Pytest |
| API-252 | PATCH `/portal/api/v1/guests/{id}/disconnect` | Valid session | Valid session_id | 200 (currently 500 NameError bug) | P0 | Critical | Pytest |
| API-253 | PATCH `/portal/api/v1/guests/{id}/disconnect` | Unknown session | Invalid session_id | 404 | P1 | High | Pytest |
| API-254 | GET `/portal/api/v1/guests/stats` | Get aggregate counts | No auth | 200 `{total, active, disconnected}` | P2 | Medium | Pytest |
| API-255 | GET `/portal/api/v1/guests` | Paginated list | `?status=active&limit=10` | 200 paginated | P2 | Medium | Pytest |
