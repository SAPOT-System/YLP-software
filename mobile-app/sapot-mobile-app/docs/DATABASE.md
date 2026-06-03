# Local Database Schema

The app uses **WatermelonDB** with a SQLite adapter for local-first storage. Schema version: **11**.

All timestamps are stored as **Unix milliseconds** (`number`). All tables include an implicit `id` column (string UUID) managed by WatermelonDB.

---

## Tables

### `peers`
Stores both the current authenticated user and their peers/contacts.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID (WatermelonDB managed) |
| `username` | string | No | |
| `first_name` | string | No | |
| `last_name` | string | Yes | |
| `is_online` | boolean | No | |
| `email` | string | Yes | Current user only |
| `phone_number` | string | Yes | Current user only |
| `email_verified` | boolean | Yes | Current user only |
| `phone_number_verified` | boolean | Yes | Current user only |
| `role` | string | Yes | `"admin"` \| `"rescuer"` \| `"user"` — sourced from server on upsert |
| `is_guest` | boolean | Yes | Whether the peer is a guest account |
| `last_seen_at` | number | Yes | Unix ms of last observed activity. Server source: `UserActivity.last_active` (via `GET /user-utils/search-user/{id}`, refreshed when the peer is offline); LAN fallback: stamped on mDNS online/offline. Drives the "Last seen …" header label. |

---

### `guest_user`
Stores guest user profile when the app is used without an account.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `first_name` | string | No | |
| `last_name` | string | No | |
| `username` | string | No | |

---

### `conversations`
A conversation groups messages between participants.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `type` | string | No | `"direct"` \| `"group"` (ConversationType) |
| `title` | string | Yes | Used for group conversations |
| `created_at` | number | No | Unix ms |
| `updated_at` | number | No | Unix ms |
| `is_deleted` | boolean | No | Soft delete |

---

### `conversation_participants`
Join table — which users belong to which conversation.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `conversation` | string | No | FK → `conversations.id` |
| `user` | string | No | FK → `peers.id` |
| `joined_at` | number | No | Unix ms |
| `created_at` | number | No | Unix ms |
| `updated_at` | number | No | Unix ms |
| `is_deleted` | boolean | No | Soft delete |

---

### `messages`
Individual chat messages within a conversation.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `conversation` | string | No | FK → `conversations.id` |
| `sender` | string | No | FK → `peers.id` |
| `message_type` | string | No | `"text"` \| `"file"` \| `"call_log"` |
| `content` | string | No | Message text or file reference |
| `created_at` | number | No | Unix ms |
| `updated_at` | number | No | Unix ms |
| `is_deleted` | boolean | No | Soft delete |

---

### `message_receipts`
Delivery and read status per message per user.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `message` | string | No | FK → `messages.id` |
| `user` | string | No | FK → `peers.id` |
| `status` | string | No | `"sent"` \| `"delivered"` \| `"seen"` (MessageStatusType) |
| `created_at` | number | No | Unix ms |
| `updated_at` | number | No | Unix ms |
| `is_deleted` | boolean | No | Soft delete |

---

### `calls`
Call session records.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `conversation` | string | No | FK → `conversations.id` |
| `initiator` | string | No | FK → `peers.id` — who started the call |
| `call_type` | string | No | `"audio"` \| `"video"` (CallType) |
| `status` | string | No | `"completed"` \| `"missed"` \| `"rejected"` (CallStatus) |
| `start_time` | number | No | Unix ms |
| `end_time` | number | Yes | Unix ms — null while call is active |
| `created_at` | number | No | Unix ms |
| `updated_at` | number | No | Unix ms |
| `is_deleted` | boolean | No | Soft delete |

---

### `call_participants`
Which users participated in each call.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | — | UUID |
| `call` | string | No | FK → `calls.id` |
| `user` | string | No | FK → `peers.id` |
| `joined_at` | number | No | Unix ms |
| `left_at` | number | Yes | Unix ms — null while still in call |
| `created_at` | number | No | Unix ms |
| `updated_at` | number | No | Unix ms |
| `is_deleted` | boolean | No | Soft delete |

---

## Enum Reference

| Enum | Values |
|---|---|
| `MessageType` | `"text"` \| `"file"` \| `"call_log"` |
| `MessageStatusType` | `"sent"` \| `"delivered"` \| `"seen"` |
| `CallType` | `"audio"` \| `"video"` |
| `CallStatus` | `"completed"` \| `"missed"` \| `"rejected"` |
| `ConversationType` | `"direct"` \| `"group"` |

---

## Relationships

```
conversations ──< conversation_participants >── peers
conversations ──< messages
messages ──< message_receipts >── peers
conversations ──< calls
calls ──< call_participants >── peers
```

---

## Sync

WatermelonDB uses a **pull/push sync** pattern with the server:
- `GET /sync/pull?last_pulled_at=<ms>&schema_version=<n>` — fetches changes since last sync
- `POST /sync/push` — pushes local created/updated/deleted records

All synced tables use `is_deleted` (soft delete) and `updated_at` for conflict resolution.

Schema and migrations: `features/shared/database/schema.ts`, `features/shared/database/migrations.ts`
