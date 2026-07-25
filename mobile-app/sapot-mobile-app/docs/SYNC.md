# Sync

SAPOT uses a pull-then-push sync cycle to keep the local WatermelonDB database consistent with the FastAPI backend. The sync is incremental — only records changed since the last successful pull are exchanged.

---

## Overview

```
App (WatermelonDB)  ←──── GET /sync/pull ────  Server
App (WatermelonDB)  ────► POST /sync/push ───►  Server
```

The mobile app is the source of truth for P2P messages (sent over WebRTC data channels). The server is the source of truth for history, cross-device continuity, and any records created by other participants.

---

## Service: `SyncService`

**Location:** `features/sync/services/sync-service.ts`

Wraps WatermelonDB's `synchronize()` and adds:
- Custom `lastPulledAt` persistence via expo-secure-store (key: `syncLastPulledAt`)
- Field normalization between WatermelonDB column names and server snake_case names
- Concurrency guard (`isSyncing`) — concurrent `syncNow()` calls are dropped safely

### Constructor

```typescript
new SyncService({ db: Database })
```

Injected into `MainContainer` and passed to `ChatService` and `CallService`.

---

## Sync Cycle (`syncNow`)

`syncNow()` calls WatermelonDB's `synchronize()` which runs pull then push in order:

### 1. Pull (`GET /sync/pull`)

```
lastPulledAt = getSyncLastPulledAt()   // read from expo-secure-store (0 on first sync)
→ GET /sync/pull?last_pulled_at=<ts>
← { changes, timestamp }
→ normalizePullChanges(changes)        // map server field names to WatermelonDB columns
→ saveSyncLastPulledAt(timestamp)      // persist new timestamp to expo-secure-store
→ return { changes, timestamp }        // WatermelonDB applies changes to local DB
```

Server returns all records created or updated after `last_pulled_at`. On the first sync (`last_pulled_at = 0`) the server returns all records the user is authorized to see, up to a server-side `limit` (default 100) per table, with `has_more`/`next_cursor` in each table's response — the client does not currently page through these on a single `syncNow()` call. `schema_version` is not sent/accepted; a prior version of this doc referenced it, but the server param is commented out (see `app/api/sync.py`).

### 2. Push (`POST /sync/push`)

```
lastPulledAt = getSyncLastPulledAt()   // same stored timestamp
changes = WatermelonDB dirty records   // records modified locally since last sync
→ buildPushPayload(changes)            // map WatermelonDB columns to server field names
→ POST /sync/push { last_pulled_at, changes }
← { status: "ok" }
```

WatermelonDB tracks which local records are dirty. `buildPushPayload` converts them to the server's snake_case format using `toServerPayload()` per entity. The push body also carries an optional `guest_users` map of display-name hints, keyed by user ID, so the server can materialize a placeholder user record for not-yet-registered peers referenced by a pushed record (e.g. a P2P-only message from a guest) instead of rejecting it on the FK.

The server can reject a push with `409` (a referenced record was updated remotely after `last_pulled_at` — client should re-pull first) or `404` (the record was already soft-deleted server-side); `syncNow()`'s fire-and-forget triggers mean these currently surface only in logs, not to the UI.

---

## `lastPulledAt` — Custom Tracking

WatermelonDB tracks `lastPulledAt` internally, but SAPOT overrides this with expo-secure-store to:
- Survive database resets or migrations
- Make the sync cursor explicit and inspectable
- Share the value between pull and push callbacks

| Key | Store | Default |
|-----|-------|---------|
| `syncLastPulledAt` | expo-secure-store | `0` (full sync on first open) |

The stored timestamp is updated only after a successful pull. A failed pull leaves the timestamp unchanged so the next sync retries from the same point.

---

## Trigger Points

| Event | Trigger |
|-------|---------|
| App cold start | `MainContainer.initialize()` → `void syncService.syncNow()` |
| Message sent | `ChatService.sendChatMessage()` → `void syncService.syncNow()` |
| ACK received (message delivered) | `ChatService.handleAckMessage()` → `void syncService.syncNow()` |
| Call terminated (local) | `CallService.terminateCallConnection()` → `void syncService.syncNow()` |
| Remote call ended | `CallService.handleRemoteCallEnded()` → `void syncService.syncNow()` |
| Manual | Drawer → "Sync Now" button → `syncService.syncNow()` |
| Network restored | `syncService.handleConnectivityChange(true)` → `syncNow()` |

All triggers are fire-and-forget (`void`) — sync failures are logged but do not propagate to the caller. The `isSyncing` guard ensures rapid consecutive triggers collapse into a single cycle.

---

## Entities Synced

| Entity | WatermelonDB table | Server field notes |
|--------|-------------------|-------------------|
| Conversations | `conversations` | `conversation_type` aliased as `type` for WatermelonDB |
| Conversation participants | `conversation_participants` | `conversation_id` → `conversation`, `user_id` → `user` |
| Messages | `messages` | `conversation_id` → `conversation`, `sender_id` → `sender` |
| Calls | `calls` | `conversation_id` → `conversation`, `initiator_id` → `initiator` |
| Call participants | `call_participants` | `conversation_id` → `call`, `user_id` → `user` |
| Message receipts | `message_receipts` | `message_id` → `message`, `user_id` → `user` |

---

## Field Normalization

Two directions of mapping are handled automatically:

**Pull (server → WatermelonDB):** `normalizePullChanges()` — pulled out to `SyncPullNormalizer`
- Converts timestamps from `string | number` to `number` via `toTimestamp()`
- Adds WatermelonDB relation aliases (e.g. `conversation_id` → `conversation`)
- Defaults `is_deleted` to `false` when missing

**Push (WatermelonDB → server):** `buildPushPayload()` — pulled out to `SyncPayloadBuilder`
- Merges camelCase and snake_case aliases (e.g. `callType ?? call_type`)
- Converts all timestamps to integers via `toInt()`
- Casts booleans with `Boolean()`

---

## Sync Logs

`SyncService` uses WatermelonDB's built-in `SyncLogger` (retains last 20 logs):

```typescript
syncService.syncLogs          // raw log array
syncService.formattedSyncLogs // human-readable string
```

Scope-based logging uses the `syncLog` scope. Enable at runtime:
```
EXPO_PUBLIC_ENABLED_LOG_MODULES=sync
```

---

## API Reference

See `docs/API.md` — **Sync** section (`GET /sync/pull`, `POST /sync/push`).

## Secure Storage

See `features/shared/core/stores/secure-config.ts` — `getSyncLastPulledAt` / `saveSyncLastPulledAt`.
