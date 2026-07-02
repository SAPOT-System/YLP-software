# Sync API

Machine-readable spec: [`openapi/sync.yaml`](openapi/sync.yaml) (generated from the live FastAPI app).

The sync endpoints implement a WatermelonDB-compatible pull/push protocol. The mobile app uses these to keep its local SQLite database in sync with the server's MariaDB (router in `server/app/api/sync.py`, prefix `/sync`).

All sync endpoints require JWT Bearer auth.

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/sync/pull` | JWT Bearer | Pull changes since `last_pulled_at` across all synced tables, paginated. |
| POST | `/sync/push` | JWT Bearer | Push local changes (created/updated/deleted) across all synced tables, with optimistic-concurrency conflict detection. |

---

## GET /sync/pull

Pull changes from the server since the last successful sync.

**Auth:** JWT Bearer

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `last_pulled_at` | integer (ms epoch) | `0` | Timestamp of the last successful pull. `0` triggers an initial (full) sync. |
| `limit` | integer | `100` | Maximum records per table per request. |

**Response 200:**

```json
{
  "changes": {
    "conversations": {
      "created": [],
      "updated": [],
      "deleted": ["<uuid>"],
      "next_cursor": 1719561600000,
      "has_more": false
    },
    "messages": { "created": [], "updated": [], "deleted": [], "next_cursor": null, "has_more": false },
    "conversation_participants": { "created": [], "updated": [], "deleted": [], "next_cursor": null, "has_more": false },
    "calls": { "created": [], "updated": [], "deleted": [], "next_cursor": null, "has_more": false },
    "call_participants": { "created": [], "updated": [], "deleted": [], "next_cursor": null, "has_more": false },
    "message_receipts": { "created": [], "updated": [], "deleted": [], "next_cursor": null, "has_more": false }
  },
  "timestamp": 1719561600000
}
```

**Tables returned:** `conversations`, `messages`, `conversation_participants`, `calls`, `call_participants`, `message_receipts`.

**Scoping:** Only records belonging to the authenticated user are returned (conversations the user participates in, messages in those conversations, etc.).

**Categorisation logic:**
- `created` — new records (initial sync: all non-deleted; incremental: `created_at > last_pulled_at`)
- `updated` — modified records (`updated_at > last_pulled_at` but `created_at <= last_pulled_at`)
- `deleted` — soft-deleted records; returned as an array of UUID strings only

**Timestamps:** All `created_at`/`updated_at` values are milliseconds since Unix epoch.

**Cursor pagination:** If `has_more` is `true`, use `next_cursor` as `last_pulled_at` for the next page.

---

## POST /sync/push

Push local changes to the server.

**Auth:** JWT Bearer

Request body is `PushSyncRequest` — see [`openapi/sync.yaml`](openapi/sync.yaml) for the exact field schema (`last_pulled_at`, per-table `changes`, optional `guest_users`).

**`guest_users`** (optional): Hints for unknown user IDs in the push payload. If a `sender_id` does not exist on the server, a placeholder guest user is created using these hints. This supports P2P-discovered peers who have not yet registered.

**Processing order:** Tables are processed in FK-safe order: `conversations` -> `messages` -> `conversation_participants` -> `calls` -> `call_participants` -> `message_receipts`.

**Upsert logic:** Created and updated arrays are merged and upserted. If the record exists it is updated; if not, it is created.

**Conflict detection:** If a record's `updated_at` on the server is greater than `last_pulled_at`, the push is rejected with 409. The client must pull again before retrying.

**Soft deletes:** Deleted IDs set `is_deleted = true` rather than hard-deleting.

**MessageReceipt guard:** Receipts whose parent message does not exist on the server are silently skipped (handles receipts for P2P-only messages delivered via TCP/WebRTC). They are retried on the next sync once the parent message is pushed.

**Response 200:**

```json
{ "status": "ok" }
```

**Errors:**
- `409` — conflict: a record was modified on the server after `last_pulled_at`
- `404` — a record in the push payload is already deleted on the server
- `500` — internal sync error (transaction rolled back)
