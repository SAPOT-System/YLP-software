# Database Tables Reference

Derived from `server/app/models/` via `scripts/generate_db_docs.py`. For the ERD see
[erd.md](erd.md). Do not hand-edit the generated sections below this line —
run `python3 scripts/generate_db_docs.py` instead.

All tables use MariaDB. Schema is auto-created at startup — see [migrations.md](migrations.md).

> **Known issue:** `app.models.devices.Device` (table `device`) declares `id` without
> `primary_key=True`. SQLAlchemy raises `ArgumentError: could not assemble any primary key
> columns` the moment its module is imported, so it cannot be mapped at all in its current
> form. It is not imported anywhere in `server/app` and does not appear below.

---

### `blacklistedtoken`

| Column | Type | Notes |
|---|---|---|
| `jti` | CHAR(32) | PK, indexed |
| `expires_at` | DATETIME | not null |

### `conversation`

| Column | Type | Notes |
|---|---|---|
| `created_at` | BIGINT | not null, has default |
| `updated_at` | BIGINT | indexed, not null, has default |
| `is_deleted` | BOOLEAN | indexed, not null, has default |
| `id` | CHAR(32) | PK, unique, indexed, has default |
| `title` | VARCHAR(100) | not null |
| `conversation_type` | VARCHAR(6) | not null |

### `device_key`

> **Orphaned model:** not imported anywhere `app.main` reaches at import time — this table is not created by `create_all()` in production unless something else imports its module first. See the model's docstring/usage.

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, has default |
| `user_id` | CHAR(32) | indexed, not null |
| `device_fingerprint` | VARCHAR(64) | indexed, not null |
| `public_key_b64` | VARCHAR(64) | not null |
| `bound_at` | DATETIME | not null, has default |
| `last_seen` | DATETIME | not null, has default |

### `email_recovery_token`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | indexed, not null |
| `token_hash` | VARCHAR | unique, indexed, not null |
| `expires_at` | DATETIME | not null |
| `used` | BOOLEAN | not null, has default |
| `created_at` | DATETIME | not null, has default |

### `guest_sessions`

| Column | Type | Notes |
|---|---|---|
| `session_id` | VARCHAR | unique, indexed, not null |
| `first_name` | VARCHAR(100) | not null |
| `last_name` | VARCHAR(100) | not null |
| `mac_address` | VARCHAR(17) | — |
| `ip_address` | VARCHAR(45) | — |
| `hotspot_name` | VARCHAR(100) | — |
| `id` | INTEGER | PK |
| `status` | VARCHAR(12) | not null, has default |
| `login_at` | DATETIME | not null, has default |
| `disconnect_at` | DATETIME | — |

### `interfacetraffic`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `interface` | VARCHAR | not null |
| `rx_bps` | INTEGER | not null |
| `tx_bps` | INTEGER | not null |
| `created_at` | DATETIME | not null, has default |

### `login_attempt`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, has default |
| `user_id` | CHAR(32) | indexed, not null |
| `device_fingerprint` | VARCHAR(64) | indexed, not null |
| `device_type` | VARCHAR(20) | not null |
| `attempt_count` | INTEGER | not null, has default |
| `lockout_count` | INTEGER | not null, has default |
| `locked_until` | DATETIME | — |
| `last_attempt_at` | DATETIME | — |

### `passwordresetcode`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `email` | VARCHAR | indexed, not null |
| `code` | VARCHAR | indexed, not null |
| `expires_at` | DATETIME | not null |
| `used` | BOOLEAN | not null, has default |
| `attempts` | INTEGER | not null, has default |

### `passwordresettoken`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | indexed |
| `token_hash` | VARCHAR | unique, indexed, not null |
| `expires_at` | DATETIME | not null |
| `created_at` | DATETIME | not null, has default |

### `phone_password_reset_code`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `phone_number` | VARCHAR | indexed, not null |
| `code` | VARCHAR | indexed, not null |
| `expires_at` | DATETIME | not null |
| `used` | BOOLEAN | not null, has default |
| `attempts` | INTEGER | not null, has default |

### `recovery_attempt`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, has default |
| `user_id` | CHAR(32) | indexed, not null |
| `device_fingerprint` | VARCHAR(64) | indexed, not null |
| `recovery_method` | VARCHAR(30) | indexed, not null |
| `device_type` | VARCHAR(20) | not null |
| `attempt_count` | INTEGER | not null, has default |
| `lockout_count` | INTEGER | not null, has default |
| `locked_until` | DATETIME | — |
| `last_attempt_at` | DATETIME | — |

### `recovery_session`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | indexed, not null |
| `token_hash` | VARCHAR | unique, indexed, not null |
| `method` | VARCHAR | not null |
| `expires_at` | DATETIME | not null |
| `used` | BOOLEAN | not null, has default |
| `created_at` | DATETIME | not null, has default |

### `recoverykey`

| Column | Type | Notes |
|---|---|---|
| `user_id` | CHAR(32) | unique, indexed |
| `key_hash` | VARCHAR | not null |
| `created_at` | DATETIME | not null, has default |
| `updated_at` | DATETIME | not null, has default |
| `id` | CHAR(32) | PK, indexed, has default |

### `routerhealth`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `cpu_load` | FLOAT | not null |
| `free_memory` | INTEGER | not null |
| `total_memory` | INTEGER | not null |
| `uptime` | VARCHAR | not null |
| `created_at` | DATETIME | not null, has default |

### `user`

| Column | Type | Notes |
|---|---|---|
| `username` | VARCHAR(50) | unique, indexed, not null |
| `first_name` | VARCHAR(50) | indexed, not null |
| `last_name` | VARCHAR(50) | indexed, not null |
| `phone_number` | VARCHAR | unique |
| `email` | VARCHAR | unique |
| `id` | CHAR(32) | PK, indexed, has default |
| `hashed_password` | VARCHAR | not null |
| `email_verified` | BOOLEAN | not null, has default |
| `terms_accepted_at` | DATETIME | — |

### `activity_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `action` | VARCHAR | not null |
| `entity_id` | CHAR(32) | — |
| `metadata_json` | JSON | — |
| `created_at` | DATETIME | not null, has default |

### `admin`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, unique, indexed, not null |
| `created_at` | DATETIME | indexed, not null, has default |

### `announcement`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `title` | VARCHAR | not null |
| `content` | VARCHAR | not null |
| `priority` | VARCHAR(6) | not null |
| `status` | VARCHAR(7) | not null |
| `expires_at` | DATETIME | not null |
| `target_audience` | VARCHAR(7) | not null |
| `created_at` | DATETIME | indexed, not null, has default |

### `banneduser`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, unique, indexed, not null |
| `created_at` | DATETIME | indexed, not null, has default |
| `until` | DATETIME | indexed, not null |

### `call`

| Column | Type | Notes |
|---|---|---|
| `created_at` | BIGINT | not null, has default |
| `updated_at` | BIGINT | indexed, not null, has default |
| `is_deleted` | BOOLEAN | indexed, not null, has default |
| `id` | CHAR(32) | PK, indexed, has default |
| `call_type` | VARCHAR(5) | not null |
| `status` | VARCHAR(9) | not null |
| `start_time` | BIGINT | not null, has default |
| `end_time` | BIGINT | not null |
| `conversation_id` | CHAR(32) | FK -> conversation.id |
| `initiator_id` | CHAR(32) | FK -> user.id |

### `callparticipant`

| Column | Type | Notes |
|---|---|---|
| `created_at` | BIGINT | not null, has default |
| `updated_at` | BIGINT | indexed, not null, has default |
| `is_deleted` | BOOLEAN | indexed, not null, has default |
| `id` | CHAR(32) | PK, indexed, has default |
| `joined_at` | BIGINT | not null, has default |
| `left_at` | INTEGER | — |
| `call_id` | CHAR(32) | FK -> conversation.id, indexed |
| `user_id` | CHAR(32) | FK -> user.id, indexed |

### `contact_key`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `owner_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `peer_id` | VARCHAR | indexed, not null |
| `encrypted_public_key` | VARCHAR | not null |

### `conversationparticipant`

| Column | Type | Notes |
|---|---|---|
| `created_at` | BIGINT | not null, has default |
| `updated_at` | BIGINT | indexed, not null, has default |
| `id` | CHAR(32) | PK, unique, indexed, has default |
| `conversation_id` | CHAR(32) | FK -> conversation.id, indexed |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `joined_at` | BIGINT | not null, has default |
| `is_deleted` | BOOLEAN | not null, has default |

### `email_verifications`

| Column | Type | Notes |
|---|---|---|
| `user_id` | CHAR(32) | FK -> user.id, not null |
| `token` | VARCHAR | unique, indexed, not null |
| `email` | VARCHAR | — |
| `expires_at` | DATETIME | not null |
| `id` | INTEGER | PK |
| `created_at` | DATETIME | not null, has default |

### `fcmdevicetoken`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `token` | VARCHAR | unique, indexed, not null |
| `platform` | VARCHAR | not null, has default |
| `created_at` | DATETIME | not null, has default |
| `updated_at` | DATETIME | not null, has default |

### `guest`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, unique, indexed, not null |
| `created_at` | DATETIME | indexed, not null, has default |

### `message`

| Column | Type | Notes |
|---|---|---|
| `created_at` | BIGINT | not null, has default |
| `updated_at` | BIGINT | indexed, not null, has default |
| `id` | CHAR(32) | PK, indexed, has default |
| `message_type` | VARCHAR(8) | not null, has default |
| `content` | VARCHAR(255) | not null |
| `is_deleted` | BOOLEAN | not null, has default |
| `linked_message_id` | CHAR(32) | FK -> message.id |
| `conversation_id` | CHAR(32) | FK -> conversation.id, indexed |
| `sender_id` | CHAR(32) | FK -> user.id, indexed |

### `peer_key`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | FK -> user.id, unique, indexed, not null |
| `ecdh_public_key` | VARCHAR | not null |
| `issued_at` | DATETIME | not null |
| `expires_at` | DATETIME | not null |
| `signature` | VARCHAR | not null |

### `phone_verification`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `phone_number` | VARCHAR(20) | indexed, not null |
| `verification_code` | VARCHAR(6) | indexed, not null |
| `is_used` | BOOLEAN | indexed, not null, has default |
| `attempts` | INTEGER | not null, has default |
| `expires_at` | BIGINT | indexed, not null |
| `created_at` | BIGINT | not null, has default |

### `phone_verified`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |

### `queue`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, unique, indexed |
| `to` | CHAR(32) | FK -> user.id |
| `payload_type` | VARCHAR(6000) | — |
| `data_id` | VARCHAR | indexed, not null |
| `data` | VARCHAR(6000) | — |

### `rescuer`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `user_id` | CHAR(32) | FK -> user.id, unique, indexed, not null |
| `created_at` | DATETIME | indexed, not null, has default |

### `user_activity`

| Column | Type | Notes |
|---|---|---|
| `user_id` | CHAR(32) | PK, FK -> user.id |
| `last_active` | DATETIME | not null, has default |
| `status` | VARCHAR | not null, has default |
| `ip_address` | VARCHAR | — |
| `user_agent` | VARCHAR | — |

### `userlocation`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `latitude` | FLOAT | not null |
| `longitude` | FLOAT | not null |
| `timestamp` | DATETIME | indexed, not null, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |

### `userprofilepicture`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, has default |
| `filename` | VARCHAR | indexed, not null |
| `created_at` | DATETIME | not null, has default |
| `is_active` | BOOLEAN | not null, has default |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |

### `usersecurityquestion`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | FK -> user.id, not null |
| `question` | VARCHAR | not null |
| `answer_hash` | VARCHAR | not null |
| `created_at` | DATETIME | not null, has default |
| `is_burned` | BOOLEAN | not null, has default |

### `wrapped_key`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | FK -> user.id, unique, indexed, not null |
| `wrapped_blob` | VARCHAR | not null |
| `created_at` | DATETIME | not null, has default |
| `updated_at` | DATETIME | not null, has default |

### `wrapped_key_recovery`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | CHAR(32) | FK -> user.id, indexed, not null |
| `method` | VARCHAR | indexed, not null |
| `wrapped_blob` | VARCHAR | not null |
| `recovery_metadata` | VARCHAR | — |
| `created_at` | DATETIME | not null, has default |
| `updated_at` | DATETIME | not null, has default |

### `attachment`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(32) | PK, indexed, has default |
| `message_id` | CHAR(32) | FK -> message.id, not null |
| `file_path` | VARCHAR(255) | not null |
| `file_name` | VARCHAR(200) | not null |
| `file_size` | INTEGER | not null |
| `mime_type` | VARCHAR(255) | not null |

### `messagereceipt`

| Column | Type | Notes |
|---|---|---|
| `created_at` | BIGINT | not null, has default |
| `updated_at` | BIGINT | indexed, not null, has default |
| `is_deleted` | BOOLEAN | indexed, not null, has default |
| `id` | CHAR(32) | PK, indexed, has default |
| `status` | VARCHAR(9) | not null |
| `message_id` | CHAR(32) | FK -> message.id, not null |
| `user_id` | CHAR(32) | FK -> user.id, not null |

---

## Mobile App Tables (WatermelonDB)

Not introspectable from `server/app/models/` (different language/ORM) — hand-maintained here
from `mobile-app/sapot-mobile-app/features/shared/core/database/schema.ts` (schema version 11).
All tables use WatermelonDB's implicit `id` primary key (framework-managed, not declared in
`tableSchema()`). For migration history per column, see
[migrations.md](migrations.md#mobile-app-watermelondb).

### `guest_user`

| Column | Type | Notes |
|---|---|---|
| `first_name` | string | — |
| `last_name` | string | — |
| `username` | string | — |

### `peers`

| Column | Type | Notes |
|---|---|---|
| `username` | string | — |
| `is_online` | boolean | — |
| `first_name` | string | — |
| `last_name` | string | optional |
| `email` | string | optional; current authenticated user's own profile mirror |
| `phone_number` | string | optional |
| `email_verified` | boolean | optional (added v4) |
| `phone_number_verified` | boolean | optional (added v7) — declared twice in `schema.ts`'s column array; a source-level duplicate, not a docs error |
| `role` | string | optional (added v9) |
| `is_guest` | boolean | optional (added v10) |
| `last_seen_at` | number | optional (added v11) |

### `messages`

| Column | Type | Notes |
|---|---|---|
| `conversation` | string | FK to `conversations.id` |
| `sender` | string | FK to `peers.id` |
| `message_type` | string | — |
| `content` | string | — |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |
| `linked_message_id` | string | optional (added v8) — reply-thread self-reference |
| `is_encrypted` | boolean | optional (added v9) |

### `calls`

| Column | Type | Notes |
|---|---|---|
| `conversation` | string | FK to `conversations.id` |
| `initiator` | string | FK to `peers.id` |
| `call_type` | string | — |
| `status` | string | — |
| `start_time` | number | ms epoch |
| `end_time` | number | optional, ms epoch |
| `updated_at` | number | ms epoch |
| `created_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `call_participants`

| Column | Type | Notes |
|---|---|---|
| `call` | string | FK to `calls.id` |
| `user` | string | FK to `peers.id` |
| `joined_at` | number | ms epoch |
| `left_at` | number | optional, ms epoch |
| `updated_at` | number | ms epoch |
| `created_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `message_receipts`

| Column | Type | Notes |
|---|---|---|
| `message` | string | FK to `messages.id` |
| `user` | string | FK to `peers.id` |
| `status` | string | — |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `conversations`

| Column | Type | Notes |
|---|---|---|
| `type` | string | — |
| `title` | string | optional |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `conversation_participants`

| Column | Type | Notes |
|---|---|---|
| `conversation` | string | FK to `conversations.id` |
| `user` | string | FK to `peers.id` |
| `joined_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
