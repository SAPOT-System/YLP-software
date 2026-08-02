# Database Schema Overview

YLP-SAPOT (SAPOT Server) uses **MariaDB** as its database engine via SQLModel (an SQLAlchemy wrapper). The schema is applied by **Alembic** at deploy time (`alembic upgrade head` in `server/runserver.sh`), not created at application startup; `create_db_and_tables()` was removed from the FastAPI `lifespan`. See [migrations.md](migrations.md) for the workflow and [ADR 0007](../adr/0007-alembic-for-server-migrations.md) for the decision.

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

Conversations hold messages between participants, which carry attachments and are tracked per-recipient.

| Table | Class | Purpose |
|-------|-------|---------|
| `conversation` | `Conversation` | Chat channel; types: `direct`, `solo`, `sms` |
| `conversationparticipant` | `ConversationParticipant` | Join table linking users to conversations |
| `message` | `Message` | Individual message |
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

### 9. Devices (dead code — no table is created)

`server/app/models/devices.py` declares a `Device` SQLModel with `table=True`, but it is
**never imported** — not by `app/models/__init__.py`, not by any router. Because SQLModel only
registers metadata for imported modules, no `device` table exists in `SQLModel.metadata`, so
Alembic autogenerate never emitted one and it correctly does not appear in the generated
[tables.md](tables.md). `app/models/__init__.py` carries a commented-out import for it with the
reason: its `id` field lacks `primary_key=True`, so SQLAlchemy cannot map it at all.

Two further signs the model was abandoned mid-implementation: its `id` field has no
`primary_key=True`, and its `Relationship(back_populates="devices")` points at a `User.devices`
attribute that does not exist — so importing it as-is would likely fail to map.

Treat `Device` as dead code, not as schema. Per-device public keys are handled by the
`device_key` table (`DeviceKey`, see group 7) instead.

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
| `messages` | Individual message; `is_encrypted` flag (added v9) marks NaCl-box-encrypted content; `linked_message_id` (added v8, paired a P2P message with its SMS duplicate) is retained unused since the dual-send UX was removed — see [migrations.md](migrations.md#version-by-version-history-v4--v11) |
| `message_receipts` | Per-(message, peer) delivery/read status |

### 3. Calls

| Table | Purpose |
|-------|---------|
| `calls` | Local call record: `call_type`, `status`, `start_time`, `end_time` |
| `call_participants` | Per-peer join/leave record for a call session |

### Sync-tracked tables

`messages`, `calls`, `call_participants`, `message_receipts`, `conversations`, `conversation_participants` all carry `created_at`, `updated_at`, `is_deleted` columns and participate in the pull/push sync flow described in [SYNC.md](../../mobile-app/sapot-mobile-app/docs/SYNC.md) and [data-flow.md](../architecture/data-flow.md#1-sync-flow-pull-then-push). `peers` and `guest_user` are local-only and not synced to the server through this mechanism.
