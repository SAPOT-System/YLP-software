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
new SyncService({
  db,                     // Database — WatermelonDB instance
  messageReceiptManager,  // decides which receipts are eligible to push
  messageRepository,      // needed to re-encrypt / normalize message rows on pull
  currentUserId,          // distinguishes own records from peers'
  peerService,            // used by PeerHydrator to fill in unknown senders
  peerRepository,
})
```

Constructed in `MainContainer` and passed to `ChatService` and `CallService`.

The constructor builds five collaborators, which is where most of the real work lives —
`SyncService` itself is mostly orchestration:

| Collaborator | Role |
|---|---|
| `SyncPullNormalizer` | Maps server field names to WatermelonDB columns on the way in |
| `SyncPushFilter` | Decides which dirty records are eligible to push (see [Push](#2-push-post-syncpush)) |
| `PeerHydrator` | Materializes `peers` rows for senders the client has never seen |
| `MigrationGuard` | Protects freshly re-encrypted messages during guest→auth migration |
| `SyncLogger` | WatermelonDB's own logger — see [Sync Logs](#sync-logs) |

---

## Sync Cycle (`syncNow`)

`syncNow()` calls WatermelonDB's `synchronize()` which runs pull then push in order:

### 1. Pull (`GET /sync/pull`)

```
lastPulledAt = getSyncLastPulledAt()   // read from expo-secure-store (0 on first sync)
→ GET /sync/pull?last_pulled_at=<ts>&schema_version=<n>
  ↺ repeat while any table reports has_more, merging pages by id
← { changes, timestamp }               // timestamp from the FIRST page
→ normalizePullChanges(changes)        // map server field names to WatermelonDB columns
→ saveSyncLastPulledAt(timestamp)      // persist new timestamp to expo-secure-store
→ return { changes, timestamp }        // WatermelonDB applies changes to local DB
```

Server returns all records created or updated after `last_pulled_at`, capped at a server-side
`limit` (default 100) per table. `limit` is not client-controlled — the client sends only
`last_pulled_at` and `schema_version`.

**Paging.** Each table's change-set carries `has_more`/`next_cursor`, and `pullFromServer()` does
page through them within a single `syncNow()` call: it loops while any table reports `has_more`,
sets the next cursor to `Math.min(...next_cursor)` across just those tables, and merges each page
by id (`mergeById` / `mergeDeleted`). Two guards bound the loop — a hard cap of 50 iterations, and
an early stop if `has_more` is true but no table returns a usable `next_cursor`.

The `timestamp` persisted as the new `lastPulledAt` is the one from the **first** page, not the
last, so records written server-side during a long multi-page pull are picked up next time rather
than being skipped.

`schema_version` is sent by `features/sync/api/sync.api.ts`, but the server currently ignores it —
the parameter is commented out in `app/api/sync.py`. It is kept on the client so a future server
can start reading it without requiring a mobile release.

### 2. Push (`POST /sync/push`)

```
lastPulledAt = getSyncLastPulledAt()   // same stored timestamp
changes = WatermelonDB dirty records   // records modified locally since last sync
→ buildPushPayload(changes)            // map WatermelonDB columns to server field names
→ POST /sync/push { last_pulled_at, changes }
← { status: "ok" }
```

WatermelonDB tracks which local records are dirty. `buildPushPayload` converts them to the server's snake_case format using `toServerPayload()` per entity. The push body also carries an optional `guest_users` map of display-name hints, keyed by user ID, so the server can materialize a placeholder user record for not-yet-registered peers referenced by a pushed record (e.g. a P2P-only message from a guest) instead of rejecting it on the FK.

Message rows are always included, even when delivery is still pending or has failed locally. This gives the server a durable history copy without requiring a receipt. `SENDING` and `NOT_SENT` receipts remain local, while `SENT`, `DELIVERED`, and `READ` receipts are pushed.

Records intentionally withheld from the request are returned to WatermelonDB through `experimentalRejectedIds`. WatermelonDB therefore keeps those rows dirty instead of marking them synced. A later status transition can then retry the same receipt, and initiating calls and their participants remain pending until the call reaches a durable status.

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

| Event | Trigger | Site |
|-------|---------|------|
| App cold start | `await syncService.syncNow()` | `MainContainer.startNetworkServices()` |
| Periodic | `syncNow()` every **5 minutes** | `MainContainer` interval timer |
| Network restored | `syncService.handleConnectivityChange(isOnline)` | `MainContainer` NetInfo listener |
| App returns to foreground | `syncNow()` on `AppState === "active"` | `features/shared/hooks/use-foreground-sync.ts` |
| Message sent / status change | `syncNow()` — **skipped for guests** | `features/chat/services/chat-message-service.ts` (3 call sites) |
| Incoming message / ACK | `syncNow()` — **skipped for guests** | `features/chat/services/chat-receive-service.ts` |
| Call ended (local or remote) | `syncNow()` | `features/call/services/call-service.ts` |
| Phone number verified | `await syncNow()` | `app/(drawer)/settings/account/phone/verify-phone.tsx` |
| Manual | Pull-to-refresh on the home tab | `app/(drawer)/(tabs)/index.tsx` (`onRefresh`) |

Two gates decide whether these fire at all:

- **Guest accounts never sync from the chat path.** The `chat-message-service` and
  `chat-receive-service` triggers are wrapped in `if (!this.userStore.isGuest)`. A guest's
  messages live only on the device and in the P2P channel.
- **LAN mode skips the whole network-sync setup.** `startNetworkServices()` branches on
  `appModeStore.getEffectiveMode(...)`; when the effective mode is `lan`, the periodic timer, the
  NetInfo listener, and the startup `syncNow()` are all skipped. The single exception is a
  **one-time** push when a guest→auth migration is pending, so re-encrypted history is not lost
  on the next logout/login (logout wipes the local DB and re-login restores only from the server).

All triggers are fire-and-forget (`void`) — sync failures are logged but do not propagate to the
caller.

**The `isSyncing` guard drops, it does not queue.** `syncNow()` opens with
`if (this.isSyncing) return;`, so a trigger that arrives mid-cycle is discarded outright — it is
not deferred and re-run afterwards. A change made just after the in-flight pull has read the
database therefore waits for the *next* trigger, not for the current cycle to end. Don't rely on
"I called `syncNow()`, so it synced".

### Retry on failure

A failed cycle schedules its own retry via `scheduleRetry()` — exponential backoff with jitter:

- Up to **5 attempts**, then the counter resets and the retry chain stops silently
- Delay is `1000 × 1.8^attempt`, capped at **30 s**, multiplied by jitter in `[0.8, 1.2]` and
  floored at 200 ms
- Emits `sync-status: "retrying"`; `cleanup()` clears any pending timer

Because the retry chain gives up after 5 attempts without surfacing anything to the UI, a
persistently failing sync is only visible in the logs.

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
