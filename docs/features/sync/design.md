# Sync — Design

## Overview

Sync keeps WatermelonDB (mobile SQLite) consistent with MariaDB (server). The protocol is a simplified WatermelonDB pull/push model: the app pulls server changes since its last sync timestamp, then pushes its own local changes. Conflicts are detected server-side and returned as `409 Conflict` responses.

This feature is server-mediated; it has no P2P path.

---

## Architecture

```
Mobile                                    Server
──────────────────────────────────────    ─────────────────────────────────────
SyncService
  ├── pull()  ──── GET /sync/pull ───────► sync.py: PullHandler
  │              ◄── { changes, pulled_at, next_cursor, guest_hints } ──────────┤
  │                                                                             │
  └── push()  ──── POST /sync/push ──────► sync.py: PushHandler
               ◄── 200 OK | 409 Conflict ─────────────────────────────────────┘
```

### Mobile — SyncService

Responsibilities:
- Maintains `lastPulledAt` (ms epoch) in `AsyncStorage`.
- Runs pull → push in sequence; never runs concurrently.
- Applies `guest_hints` before merging pulled data into WatermelonDB.
- Emits `sync:start`, `sync:complete`, `sync:error` events for UI feedback.
- Schedules retries with exponential back-off on failure.

```typescript
// Simplified flow
async function runSync() {
  const lastPulledAt = await getLastPulledAt()
  const { changes, pulled_at, guest_hints } = await pull(lastPulledAt)
  applyGuestHints(guest_hints)
  await database.write(() => mergeChanges(changes))
  await setLastPulledAt(pulled_at)
  await push(collectLocalChanges())
}
```

### Server — `server/app/api/sync.py`

Two route handlers mounted at `/sync`:

| Method | Path        | Auth     | Description               |
|--------|-------------|----------|---------------------------|
| GET    | /sync/pull  | JWT user | Return changes since epoch|
| POST   | /sync/push  | JWT user | Upsert local changes      |

---

## Pull Endpoint

### Scoping

The pull handler only returns rows the authenticated user is permitted to see:

| Table                   | Scope rule                                          |
|-------------------------|-----------------------------------------------------|
| conversations           | User is a member of `conversation_participants`     |
| conversation_participants | Belongs to a scoped conversation                 |
| messages                | Belongs to a scoped conversation                   |
| message_receipts        | Belongs to a scoped message                        |
| calls                   | Belongs to a scoped conversation                   |
| call_participants       | Belongs to a scoped call                           |
| peers                   | Peers in any shared conversation                   |

### Pagination

```
GET /sync/pull?last_pulled_at=1719000000000&limit=100&cursor=eyJpZCI6IjEyMyJ9

Response:
{
  "changes": { "messages": [...], "conversations": [...] },
  "pulled_at": 1719000005000,
  "has_more": true,
  "next_cursor": "eyJpZCI6IjIzNCJ9",
  "guest_hints": { "local-uuid-xyz": "server-uuid-abc" }
}
```

The cursor is a base64-encoded JSON pointer into the result set (e.g. `{ "id": "last-seen-id" }`). Clients page until `has_more` is false, then store `pulled_at` as the new `lastPulledAt`.

---

## Push Endpoint

### Processing Order

The push handler processes table arrays in this exact order to satisfy foreign key constraints:

1. `peers`
2. `conversations`
3. `conversation_participants`
4. `messages`
5. `message_receipts` — FK guard (see below)
6. `calls`
7. `call_participants` — FK guard

### Conflict Detection

For each incoming row:

```python
server_row = db.query(table).filter(id=row.id).first()
if server_row and server_row.updated_at > request.last_pulled_at:
    raise HTTPException(409, detail={"conflict": row.id, "table": table_name})
```

On 409 the entire push is rolled back. The app must pull the conflicting rows and retry.

### MessageReceipt FK Guard

Before upserting a `message_receipt` row, the handler verifies the parent `message` row exists on the server:

```python
if not db.query(Message).filter(id=receipt.message_id).first():
    raise HTTPException(422, detail={"orphan_receipt": receipt.id})
```

Orphaned receipts are discarded with a 422 and logged. This prevents referential integrity violations when messages arrive out of order.

### Call Participant FK Guard

Same pattern: `call_participant.call_id` must reference an existing `call` row before upsert.

---

## SyncableModel Base

All models participating in sync extend `SyncableModel`:

```typescript
// shared base columns added to every synced table
created_at: number   // ms epoch, set once on create
updated_at: number   // ms epoch, updated on every write
is_deleted: boolean  // soft delete flag
```

WatermelonDB schema version: **10**.

Migrations are additive only (column additions, new tables). Destructive changes (column removal, table renames) are avoided by convention — see [migrations.md](../../database/migrations.md#mobile-app-watermelondb) and [ADR 0003](../../adr/0003-watermelondb-for-mobile-local-database.md).

---

## Guest User Hint Map

When a user creates a record locally (e.g. a new conversation) before the server has confirmed it, a local UUID is generated. After the first successful push the server response includes:

```json
{
  "guest_hints": {
    "local-uuid-aaa": "server-uuid-bbb"
  }
}
```

`SyncService.applyGuestHints()` rewrites all local FK references before merging the pulled data so that subsequent pulls/pushes use the canonical server ID.

---

## Error Handling

| HTTP status | Meaning                              | App action                                     |
|-------------|--------------------------------------|------------------------------------------------|
| 200         | Success                              | Merge changes, update `lastPulledAt`           |
| 401         | Token expired                        | Refresh token, retry once                      |
| 409         | Conflict on push                     | Re-pull conflicting rows, retry push           |
| 422         | Orphaned FK row                      | Discard orphan, log warning, continue push     |
| 503         | Server unavailable                   | Back-off retry; do not corrupt local state     |

---

## Dependencies

| Component             | Purpose                              |
|-----------------------|--------------------------------------|
| WatermelonDB          | Local SQLite ORM + sync primitives   |
| AsyncStorage          | Persist `lastPulledAt`               |
| FastAPI (`sync.py`)   | Pull and push endpoint handlers      |
| MariaDB               | Authoritative server data store      |
| SQLAlchemy            | ORM for server-side DB access        |

---

## Non-goals

- No real-time sync — this is a periodic pull/push cycle, not a live subscription; near-real-time delivery for messages/calls/GPS is handled by their own dedicated WebSocket paths (see [messaging](../messaging/design.md), [gps](../gps/design.md)), not by this sync mechanism.
- No automatic conflict resolution beyond last-write-wins-by-rejection — a 409 conflict requires the client to re-pull and retry; there is no server-side merge logic for conflicting field-level edits.
- No schema-version negotiation between mobile and server — the server has no concept of "client schema version" and always returns current-shape data; any shape mismatch is a deploy-coordination problem, not something this protocol detects.
- No sync for E2E-encryption key material itself — `WrappedKey`/`PeerKey` have their own dedicated endpoints (see [e2e-encryption design](../e2e-encryption/design.md)), not the generic sync pull/push path.

## Failure handling

- **409 Conflict on push:** the entire push is rolled back (not partially applied) — the client must re-pull the conflicting rows and retry the full push, per [Conflict Detection](#conflict-detection).
- **422 orphaned FK row** (`message_receipt`/`call_participant` referencing a not-yet-synced parent): the offending row is discarded server-side with a logged warning; the rest of the push is unaffected — this trades strict completeness for forward progress when rows arrive out of order.
- **401 token expired mid-sync:** the client refreshes the token and retries the sync operation once, per [Error Handling](#error-handling) — it does not abandon the sync cycle outright.
- **503 server unavailable:** the client backs off and retries without mutating local state — a sync failure must never corrupt or lose local WatermelonDB data.
- **Sync interrupted mid-pull (app killed, network drop):** `lastPulledAt` is only advanced after a full page (or the final page, when `has_more` is false) is successfully merged — a partial pull does not advance the cursor, so the next sync attempt safely re-fetches from the last confirmed point rather than skipping data.

## Performance impact

- Sync is incremental (`last_pulled_at` cursor), not a full-table dump — steady-state sync cost scales with *changes since last sync*, not total data volume, keeping typical sync cycles fast even as history grows.
- Pull responses are paginated (`limit`/`cursor`) specifically to bound per-request payload size and server query cost — see [Pagination](#pagination).
- Push processing order (`peers` → `conversations` → ... → `call_participants`) is a fixed sequential dependency chain — pushes cannot be parallelized across tables within one sync cycle without risking FK violations.

## Scalability

- Designed for LAN incident-site data volumes (per [system-overview.md](../../architecture/system-overview.md)) — the pull scoping (peers/conversations a user actually participates in) keeps per-user sync payload size bounded by that user's own conversation graph, not the whole system's data.
- `guest_hints` remapping is a client-side operation whose cost scales with the number of not-yet-confirmed local records at push time — normally small (records created since the last successful push), not proportional to total local data.
- No documented behavior for very large `has_more` result sets (e.g. a device that hasn't synced in a long time) beyond standard pagination — a device offline for an extended period will simply take proportionally longer to catch up, one page at a time.

## Acceptance criteria

- A device that goes offline and comes back online eventually converges to the same conversation/message state as other devices, without manual intervention.
- A push that conflicts with a newer server-side change is rejected (409) rather than silently overwriting the newer data.
- An orphaned `message_receipt`/`call_participant` row never corrupts referential integrity server-side (rejected with 422, not inserted).
- A locally-created record's local UUID resolves correctly to its server-assigned ID via `guest_hints` on the very next pull after its first successful push.
- Sync failures (401/503) never leave local WatermelonDB data in a partially-applied or corrupted state.
