# Database Schema Overview

YLP-SAPOT (SAPOT Server) uses **MariaDB** as its database engine via SQLModel (an SQLAlchemy wrapper). The schema is auto-created at application startup by `create_db_and_tables()` — there is no migration tooling. See [migrations.md](migrations.md) for operational implications.

---

## SyncableModel Base Class

Several messaging and call tables inherit from `SyncableModel` (defined in `message.py`). It adds three columns to every inheriting table:

| Column | Type | Notes |
|--------|------|-------|
| `created_at` | BIGINT (ms epoch) | Set once at insert |
| `updated_at` | BIGINT (ms epoch, index) | Auto-updated via `onupdate` trigger |
| `is_deleted` | BOOLEAN (index) | Soft-delete flag; default `False` |

Timestamps are stored as **milliseconds since Unix epoch** (not ISO datetimes), which is the format WatermelonDB sync expects on the mobile client.

Tables that extend `SyncableModel`: `conversation`, `conversationparticipant`, `message`, `messagereceipt`, `call`, `callparticipant`.

---

## Entity Groups

### 1. Users and Roles

The `user` table is the central identity record. Role membership is expressed through satellite tables that hold a foreign key back to `user.id` with a unique constraint — each user can hold at most one record per role table.

| Table | Class | Purpose |
|-------|-------|---------|
| `user` | `User` | Core identity: credentials, contact info, verification flags |
| `rescuer` | `Rescuer` | Marks a user as a rescue-role member |
| `admin` | `Admin` | Marks a user as an administrator |
| `guest` | `Guest` | Marks a user as a guest-tier member |
| `banneduser` | `BannedUser` | Tracks bans with an expiry timestamp |
| `userprofilepicture` | `UserProfilePicture` | Profile photo filename; `is_active` allows historical retention |
| `userlocation` | `UserLocation` | GPS pings per user; one-to-many history |

### 2. Authentication and Verification

Covers OTP flows, password reset, JWT blacklist, and login rate-limiting.

| Table | Class | Purpose |
|-------|-------|---------|
| `email_verifications` | `EmailVerification` | 6-digit email OTP with 10-minute expiry |
| `phone_verification` | `PhoneVerification` | 6-digit SMS OTP with attempt counter |
| `phone_verified` | `PhoneVerified` | Presence record indicating phone is confirmed |
| `passwordresetcode` | `PasswordResetCode` | Email-based password reset code |
| `phone_password_reset_code` | `PhonePasswordResetCode` | SMS-based password reset code |
| `email_recovery_token` | `EmailRecoveryToken` | Email recovery link token (hashed) |
| `passwordresettoken` | `PasswordResetToken` | Generic password reset token (hashed) |
| `blacklistedtoken` | `BlacklistedToken` | JWT JTI blacklist for logout invalidation |
| `usersecurityquestion` | `UserSecurityQuestion` | One security question + hashed answer per user |
| `login_attempt` | `LoginAttempt` | Per-(user, device) login attempt and lockout tracking |
| `recovery_attempt` | `RecoveryAttempt` | Per-(user, device, method) recovery attempt tracking |

### 3. Messaging

Conversations hold messages between participants. Messages can reference each other (reply thread), carry attachments, and be tracked per-recipient.

| Table | Class | Purpose |
|-------|-------|---------|
| `conversation` | `Conversation` | Chat channel; types: `direct`, `solo`, `sms` |
| `conversationparticipant` | `ConversationParticipant` | Join table linking users to conversations |
| `message` | `Message` | Individual message; supports reply via `linked_message_id` |
| `messagereceipt` | `MessageReceipt` | Per-(message, user) delivery/read status |
| `attachment` | `Attachment` | File attachment metadata for a message |
| `queue` | `Queue` | Server-side delivery queue for offline users |

### 4. Calls

Voice and video calls are modelled as records on a conversation. Call participants track join/leave times.

| Table | Class | Purpose |
|-------|-------|---------|
| `call` | `Call` | Call record with type, status, and timing |
| `callparticipant` | `CallParticipant` | Per-user join/leave record for a call session |

> **Note:** `callparticipant.call_id` carries a foreign key to `conversation.id`, not `call.id`. This is how the code is written; it effectively identifies the conversation context of the call rather than the individual call record.

### 5. Keys and Encryption

ECDH-based E2E encryption for peer-to-peer channels. The server stores opaque encrypted blobs and public keys.

| Table | Class | Purpose |
|-------|-------|---------|
| `peer_key` | `PeerKey` | Per-user ECDH public key with expiry and server signature |
| `contact_key` | `ContactKey` | Encrypted public keys for non-registered (guest) peers |
| `device_key` | `DeviceKey` | Public key bound to a device fingerprint |
| `wrapped_key` | `WrappedKey` | User's master key wrapped (encrypted) for server storage |
| `wrapped_key_recovery` | `WrappedKeyRecovery` | Recovery copies of the wrapped master key, one per method |
| `recoverykey` | `RecoveryKey` | Hashed recovery key for account recovery |
| `recovery_session` | `RecoverySession` | Time-limited recovery session token (hashed) |

### 6. Activity and Admin

| Table | Class | Purpose |
|-------|-------|---------|
| `user_activity` | `UserActivity` | Latest online status and IP per user (one-to-one) |
| `activity_logs` | `ActivityLog` | Append-only audit log of mutating API actions |
| `announcement` | `Announcement` | Admin-published announcements with audience targeting |

### 7. Router and Network Metrics

Populated by a background thread (`collect_metrics_loop`) that polls the MikroTik router via its API.

| Table | Class | Purpose |
|-------|-------|---------|
| `routerhealth` | `RouterHealth` | CPU load, memory, and uptime snapshots |
| `interfacetraffic` | `InterfaceTraffic` | Per-interface Rx/Tx bandwidth snapshots |

### 8. Captive Portal

Standalone table used by the MikroTik hotspot captive portal integration. It is not linked to the `user` table.

| Table | Class | Purpose |
|-------|-------|---------|
| `guest_sessions` | `GuestSession` | Walk-in guest login sessions from hotspot |

### 9. Devices (Legacy / Partial)

| Table | Class | Notes |
|-------|-------|-------|
| `device` | `Device` | Public key and last-online per device; FK to `user.id` is nullable. The model declares no `primary_key=True` on its `id` field, which is anomalous and may indicate this table is not actively used. |

---

## Key Relationships

```
user  1──* rescuer          (role badge)
user  1──1 admin            (role badge)
user  1──1 guest            (role badge)
user  1──* conversationparticipant ──* conversation
user  1──* message
user  1──* messagereceipt
user  1──* call             (initiator)
user  1──* callparticipant
user  1──* userlocation
user  1──1 user_activity
user  1──* activity_logs
user  1──1 wrapped_key
user  1──* wrapped_key_recovery
user  1──1 peer_key
conversation 1──* message
conversation 1──* call
conversation 1──* callparticipant
message 1──1 attachment
message 1──1 messagereceipt
message 0──1 message        (self-ref reply via linked_message_id)
```

---

## Mobile App Schema Overview

The mobile app (`mobile-app/sapot-mobile-app/`) uses **WatermelonDB** (SQLite-backed) as its on-device store, defined in `features/shared/core/database/schema.ts` — currently **version 11**. Unlike the server, mobile schema changes are applied via versioned migrations; see [migrations.md](migrations.md#mobile-app-watermelondb).

The mobile schema is deliberately narrower than the server's: it holds only what's needed for local chat/call state, presence, and offline-first sync — not auth, admin, or router-metric tables (those stay server-side and are fetched over REST).

### 1. Local Identity

| Table | Purpose |
|-------|---------|
| `guest_user` | Local-only profile for the current guest (unauthenticated) user: `first_name`, `last_name`, `username` |
| `peers` | Every known peer (contact), plus the current authenticated user's own profile mirror. Holds presence (`is_online`, `last_seen_at`), verification flags (`email_verified`, `phone_number_verified`), `role` (added v9, mirrors server-side role) and `is_guest` (added v10) |

### 2. Messaging

| Table | Purpose |
|-------|---------|
| `conversations` | Local mirror of a chat channel (`type`, `title`) |
| `conversation_participants` | Join table linking `peers` to `conversations` |
| `messages` | Individual message; `is_encrypted` flag (added v9) marks NaCl-box-encrypted content; `linked_message_id` (added v8) supports reply threads |
| `message_receipts` | Per-(message, peer) delivery/read status |

### 3. Calls

| Table | Purpose |
|-------|---------|
| `calls` | Local call record: `call_type`, `status`, `start_time`, `end_time` |
| `call_participants` | Per-peer join/leave record for a call session |

### Sync-tracked tables

`messages`, `calls`, `call_participants`, `message_receipts`, `conversations`, `conversation_participants` all carry `created_at`, `updated_at`, `is_deleted` columns and participate in the pull/push sync flow described in [SYNC.md](../../mobile-app/sapot-mobile-app/docs/SYNC.md) and [data-flow.md](../architecture/data-flow.md#1-sync-flow-pull-then-push). `peers` and `guest_user` are local-only and not synced to the server through this mechanism.
