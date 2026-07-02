# Sync — Requirements

## User Stories

| ID    | As a…       | I want to…                                               | So that…                                              |
|-------|-------------|----------------------------------------------------------|-------------------------------------------------------|
| SY-01 | user        | see my messages and conversations after going offline    | I can read history without a network connection       |
| SY-02 | user        | have my data automatically synchronised when I reconnect | I do not have to manually refresh                    |
| SY-03 | user        | never lose a message I sent while offline                | My outbox is reliably delivered once connectivity returns |
| SY-04 | rescuer     | have all user-reported data available on my device       | I can act on information even in poor-signal areas    |
| SY-05 | developer   | detect and resolve write conflicts predictably           | Data integrity is maintained across all devices       |

---

## Functional Requirements

### FR-SY-01 — Pull Protocol

- The mobile app calls `GET /sync/pull` with the following query parameters:

  | Parameter      | Type   | Description                                          |
  |----------------|--------|------------------------------------------------------|
  | last_pulled_at | number | ms epoch; only records with `updated_at > last_pulled_at` are returned |
  | limit          | number | Maximum records per page (default 100)               |
  | cursor         | string | Opaque pagination cursor for the next page           |

- The server returns records from all synced tables scoped to the authenticated user's membership or ownership.
- The response includes `has_more: boolean` and `next_cursor: string | null` for pagination.
- The app stores the server's `pulled_at` timestamp and uses it as `last_pulled_at` on the next pull.

### FR-SY-02 — Push Protocol

- The mobile app calls `POST /sync/push` with a JSON body containing arrays of changed rows keyed by table name.
- The server processes tables in dependency order: `conversations` before `messages`, `messages` before `message_receipts`, `calls` before `call_participants`.
- For each incoming row the server checks: if a local server record exists and its `updated_at > last_pulled_at` the request returns `409 Conflict` for that row.
- On 409 the app must pull the conflicting rows again before retrying the push.
- Rows with no conflict are upserted immediately.

### FR-SY-03 — Soft Delete

- Deleted records are never hard-deleted during sync. They are marked `is_deleted = true` with an updated `updated_at`.
- The pull endpoint returns soft-deleted rows so all devices learn about deletions.
- The app hides soft-deleted records from UI but retains them locally for sync consistency.

### FR-SY-04 — Synced Tables

All of the following tables participate in the pull/push cycle:

| Table                   | Notes                                              |
|-------------------------|----------------------------------------------------|
| conversations           | Owned or participated in by the current user       |
| conversation_participants | Membership rows for the above conversations      |
| messages                | Belonging to synced conversations                  |
| message_receipts        | FK-guarded: parent message must already exist      |
| calls                   | Belonging to synced conversations                  |
| call_participants       | FK-guarded: parent call must already exist         |
| peers                   | Peer profile rows visible to the current user      |

### FR-SY-05 — SyncService Trigger

- `SyncService` runs a full pull+push cycle on application foreground.
- `SyncService` runs a push-only cycle after any local write (message send, call end, receipt update).
- `SyncService` runs a periodic background pull every 30 seconds when a network connection is available.
- Failed sync attempts are retried with exponential back-off (1 s, 2 s, 4 s, … max 60 s).

### FR-SY-06 — Schema Versioning

- WatermelonDB schema version is 10.
- All syncable models extend `SyncableModel` which adds `created_at`, `updated_at` (ms epoch), and `is_deleted` columns.
- Schema upgrades increment the version and provide a migration step; no destructive migrations are permitted (see ADR-0004).

### FR-SY-07 — Guest User Hint Map

- The pull response may include a `guest_hints` map `{ [tempId: string]: serverId: string }` allowing the app to reconcile locally-generated IDs with server-assigned IDs.
- The app applies hint remapping before merging pulled records into WatermelonDB.

---

## Non-Functional Requirements

| ID      | Requirement                                                                 |
|---------|-----------------------------------------------------------------------------|
| NFR-SY-01 | Pull for 100 records must complete in under 500 ms on LAN                |
| NFR-SY-02 | Push of 50 records must complete in under 1 s on LAN                     |
| NFR-SY-03 | No user-visible data loss on network interruption mid-sync                |
| NFR-SY-04 | Sync must not block the main thread; all I/O is async                    |

---

## Out of Scope

- Real-time streaming updates (handled by WebSocket relay in the messaging feature).
- Binary file/attachment sync (not implemented in v1).
- Multi-server federation sync.
