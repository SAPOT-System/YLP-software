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
→ GET /sync/pull?last_pulled_at=<ts>&schema_version=<n>
← { changes, timestamp }
→ normalizePullChanges(changes)        // map server field names to WatermelonDB columns
→ pulledTimestamp = timestamp          // remember it; saved only after push also succeeds
→ return { changes, timestamp }        // WatermelonDB applies changes to local DB
```

Server returns all records created or updated after `last_pulled_at`. On the first sync (`last_pulled_at = 0`) the server returns all records the user is authorized to see.

### 2. Push (`POST /sync/push`)

```
lastPulledAt = <the pre-pull cursor passed in by synchronize()>  // same value the pull used
changes = WatermelonDB dirty records   // records modified locally since last sync
→ buildPushPayload(changes)            // map WatermelonDB columns to server field names
→ POST /sync/push { last_pulled_at, changes }
← { status: "ok" }

// After both pull and push resolve:
→ saveSyncLastPulledAt(pulledTimestamp) // advance the cursor only on full success
```

WatermelonDB tracks which local records are dirty. `buildPushPayload` converts them to the server's snake_case format using `toServerPayload()` per entity.

The cursor sent on push is the **pre-pull** value supplied by `synchronize()`, not a freshly-saved "now" timestamp — this is what lets the server's conflict check (`updated_at > last_pulled_at`) actually fire for records changed since the client last synced.

---

## Conflict Resolution (server wins)

When a pushed record collides with a server record that was modified after the client's
`last_pulled_at` (`record.updated_at > last_pulled_at`), or that the server has already soft-deleted,
the server **keeps its own version and skips the client's change** — the rest of the batch still
commits and `/push` returns `200 { status: "ok" }`. It no longer returns `409`/`404`.

To prevent silent divergence, on every skip the server **bumps the kept record's `updated_at` to
now**. Because that timestamp now sorts past the client's pull cursor, the authoritative version (or
the deletion) is re-delivered on the next `GET /sync/pull` and the client converges to the server's
state. See `server/app/api/sync.py` → `push_local_data`.

The client therefore has no conflict-specific handling: any error from `/push` is treated as a
transport/server failure and retried with exponential backoff via `scheduleRetry()`.

---

## `lastPulledAt` — Custom Tracking

WatermelonDB tracks `lastPulledAt` internally, but SAPOT overrides this with expo-secure-store to:
- Survive database resets or migrations
- Make the sync cursor explicit and inspectable
- Share the value between pull and push callbacks

| Key | Store | Default |
|-----|-------|---------|
| `syncLastPulledAt` | expo-secure-store | `0` (full sync on first open) |

The stored timestamp is updated only after **both** the pull and the push succeed. If either fails, the timestamp is left unchanged so the next sync retries from the same point (the re-pull is idempotent — `normalizePullChanges` drops already-present records via `checkEntitiesExist`).

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

**Pull (server → WatermelonDB):** `normalizePullChanges()`
- Converts timestamps from `string | number` to `number` via `toTimestamp()`
- Adds WatermelonDB relation aliases (e.g. `conversation_id` → `conversation`)
- Defaults `is_deleted` to `false` when missing

**Push (WatermelonDB → server):** `toServerPayload()` per entity
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

See `features/shared/stores/secure-config.ts` — `getSyncLastPulledAt` / `saveSyncLastPulledAt`.
