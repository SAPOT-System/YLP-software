# State Management Architecture

## Overview

The app layers seven distinct state mechanisms without a unifying convention. This document maps their interactions, identifies sources of truth, and highlights debugging pain points.

**TL;DR:**
- Domain data (messages/conversations/peers) → WatermelonDB (single source of truth, clean)
- Identity/config → scattered across three places: `UserStore` ↔ `peers` table ↔ `secure-store` (contestants)
- Services (`ConnectionService`, `CallService`) → event emitters mirrored into React Context via `useState` (duplication risk)
- Two redundant health contexts give conflicting server status (should be merged)
- `UserStore` is non-reactive → silent staleness bugs
- `CallContext` (751 lines, 15 event subscriptions, 4 timer-based guards) is the worst debugging pain point

---

## The Seven State Layers

| Layer | Mechanism | Examples | Reactive? | Persisted? |
|-------|-----------|----------|-----------|-----------|
| **Plain-class stores** | getters/setters, no events | `SessionStore`, `UserStore`, `NetworkConfig` | ❌ mostly no | partial |
| **Observable stores** | `subscribe()` + emit | `AppModeStore`, `ActiveUsersService` | ✅ (`useSyncExternalStore`) | `AppMode` → secure-store |
| **Event-emitter services** | TypedEventEmitter | `ConnectionService`, `CallService`, `WebrtcSessionManager` | ✅ (effects + `useState` mirror) | ❌ in-memory |
| **React Context** | `createContext` + Provider | `AuthContext`, `CallContext`, `HealthProvider` | ✅ via React | ❌ |
| **WatermelonDB** | SQLite + RxJS `.observe()` | messages, conversations, peers, calls, participants | ✅ via reactive queries + `withObservables` HOC | ✅ **domain source of truth** |
| **expo-secure-store** | encrypted key-value async storage | tokens, peerId, keys, appMode, profile, IP/port | ❌ (async reads) | ✅ |
| **React Query** | in-memory cache + refetch | GPS locations, announcements, recovery constraints | ✅ | in-memory only |

---

## Global State Ownership

### `AuthContainer` (identity layer)
**Location:** `features/auth/auth-container.ts`

Owns:
- `SessionStore` — just the current `userId` string
- `UserStore` — the current user's `Peer` or `GuestUser`, plus `isGuest`, `isRescuer`, `isAdmin` flags
- `PeerService`, `UserService`, `GuestUserRepository`, `GuestMigrationService`

**Lifetime:** created once at app boot, passed to `AuthProvider` and `MainContainerProvider`.

### `MainContainer` (runtime services)
**Location:** `features/shared/main-container.ts` (594 lines)

Owns:
- `ConnectionService` — central P2P facade, Maps of `TcpClientAdapter` per peer
- `CallService` — call lifecycle and media control
- `ChatService` — message send/receive
- `SyncService` — periodic server sync
- `ActiveUsersService` — WS presence polling
- `WebrtcSessionManager`, `SignalingService`, `CallMediaService`
- Network/crypto adapters and key services
- Wired together in constructor; constructed once in `main-container-context.tsx:38`

**Construction order matters:** `ConnectionService` is constructed last; its constructor calls `.setTcpCallbacks()` and `.setSignalingSender()` with closures so that `jest.spyOn` replacements in tests are respected.

**Lifetime:** rebuilt on `userContainer` change or when `retryCount` (explicit reset) is incremented. See [MainContainer lifecycle](#3-maincontainer-lifecycle-the-rebuild-dance) below.

### `AppModeStore` (global config)
**Location:** `features/shared/core/stores/app-mode-store.ts`

Owns: the user's transport mode preference (`auto` | `server` | `lan`), persisted to secure-store. Properly reactive via subscribe + `useSyncExternalStore`.

### `UserStore` (user identity, reactive)
**Location:** `features/shared/core/stores/user-store.ts`

Owns: the current user (`Peer` or `GuestUser`) and role flags (`isRescuer`, `isAdmin`, `isGuest`). Now reactive via `subscribe()` and integrated with `useUserStore()` hook using `useSyncExternalStore`. No more duplication with AuthContext.

---

## Sources of Truth (and Contestants)

### Domain data (messages, conversations, peers, calls)
**Source of truth:** WatermelonDB (v10 schema)
- UI reads reactively via `.observe()` + `withObservables` HOC
- **Clean.** Example: `chat-list.tsx` composes observables for latest message, unread count, participants.
- Server synced by `SyncService` with `lastPulledAt` (secure-store) controlling incremental fetches.

### User identity
**Contestants:**
1. `UserStore._user` (in-memory `Peer` or `GuestUser`)
2. `peers` table row (WatermelonDB, synced with server)
3. `secure-store` (`userUUID`, `username`, `firstName`, `lastName`)

**Reconciliation:** `UserService.syncAuthenticatedUser()` writes all three. On boot (`auth-context.tsx:212–262`), user is re-initialized from `userUUID` in secure-store, then DB/server are checked for consistency. **Risk:** if a sync path forgets one of three, staleness results.

### Role flags (isRescuer, isAdmin) — FIXED
**Single source of truth:**
1. `UserStore._isRescuer`, `UserStore._isAdmin` (reactive via `subscribe()`)
2. `peers.role` column (`"admin"` | `"rescuer"` | `"user"` | null)

**Pattern:** After login or refresh, `UserService` calls `userStore.setIsRescuer()` / `setIsAdmin()`, which emit change events. `AuthContext` subscribes to `UserStore` and re-renders consumers. `useUserStore()` uses `useSyncExternalStore` for reactive reads. Components reading via `useAuth().isRescuer` or direct `useUserStore().isRescuer` both see reactive updates.

### Connection state
**Contestants:**
1. `ConnectionService` private fields: `tcpClientAdapters: Map<string, TcpClientAdapter>`, `activeCallPeerId`, `glareAcceptedPeers: Set<string>`, `connectingPeers: Map<string, Promise<void>>`
2. Emitted events mirrored to `CallContext` useState: `callState`, `localMic`, `localCam`, `remoteCam`, `remoteMic`, `isMinimized`, `elapsed`
3. `peers.is_online` column (DB, synced by SyncService from server presence)

**Reconciliation:** `CallContext` subscribes to ~10 service events and copies values into React state. The service also keeps auth-source-of-truth in Maps (to handle concurrent calls, retries). **Problem:** if a service-side state update misses the event, the UI doesn't know. See [CallContext debugging](#1-callcontext-the-worst) below.

### Online presence (is peer online?)
**Contestants:**
1. `peers.is_online` column (set by SyncService from server)
2. `ActiveUsersService._activeIds` (WS presence polling, only in server/auto mode)
3. `ConnectionService.tcpClientAdapters.has(peerId)` (peer has a TCP connection)

**Reconciliation:** `useActivePeers()` in `use-active-users.ts:82–91` manually merges all three based on mode:
```typescript
switch (mode) {
  case "lan":
    return allPeers.filter((p) => p.isOnline);
  case "server":
    return allPeers.filter((p) => activeIds.includes(p.id));
  case "auto":
    return allPeers.filter((p) => p.isOnline || activeIds.includes(p.id));
}
```
This fragile reconciliation logic is the only place that knows the answer. Debugging "why does the UI show peer X offline when I see it in the presence list?" requires understanding all three sources.

---

## State Duplication (The Problem Areas)

### a) Role flags in three places
`isRescuer` / `isAdmin` live in:
1. `UserStore` (imperative class, no observer)
2. `peers.role` column (DB)
3. `AuthContext` useState (React)

Every login/refresh path must write all three:
- `auth-context.tsx:84–89` (refresh session)
- `auth-context.tsx:147–149` (loginAfterRegister)
- `auth-context.tsx:322–328` (login)
- `user-service.ts:82–98` (initialize)

**Risk:** forgetting one path = stale roles. And since `UserStore` is non-reactive, a component reading `userStore.isRescuer` won't update even if the flag changes.

### b) Two redundant health contexts
Both `HealthProvider` (`health-context.tsx`) and `ServerHealthProvider` (`server-health-context.tsx`) do almost the same thing:
- Initial health check on mount
- Periodic polling
- Conditional based on app mode (skip if LAN)

**Differences:**
- `HealthProvider` uses `usePing` hook; `ServerHealthProvider` uses `useHealthPoll` hook
- `HealthProvider` exposes `{ online, latency, shouldWarn }`; `ServerHealthProvider` exposes `{ online, initialChecked }`
- Both are mounted in `(drawer)/_layout.tsx:228–231`

**Problem:** Different parts of the tree see different answers. `server-health-context.tsx:36` even has a leftover `console.log("checked")`. One should be deleted.

### c) Call state mirrored from service to context
`CallContext` (751 lines) holds ~20 `useState`/`useRef` atoms that **mirror** authoritative state in `CallService`:

| Context state | Service source |
|---|---|
| `callState` | `CallService._activeCallId` + lifecycle events |
| `localMic`, `localCam` | `CallService` media toggles |
| `remoteMic`, `remoteCam` | `CallService` remote control signals |
| `remoteStreamUrl` | `callService.on("remoteStream")` |
| `elapsed` | timer loop while connected |
| `peer` | async query to `PeerService` |
| `isMinimized`, `isMinimizedRef` | local UI state |

**Subscriptions in CallContext (15+):**
- `callService.on("audio-route-changed")` → `currentRouteRef.current`
- `connectionService.on("call-ready", "mic-on", "mic-off", "camera-on", "camera-off", "call-busy")` → various setState
- `callService.on("remoteStream")` → `setRemoteStreamUrl`, `setCallState("connected")`
- `callService.on("local-stream-ready", "switch-cam")` → `setLocalStream`
- `connectionService.on("call-ended")` → `setCallState`, async finalize
- `connectionService.on("call-reconnecting", "peer-reconnected", "peer-disconnected")` → state transitions + timers

**Risk:** if a service-side state change doesn't emit, the UI is stale. If an event fires out of order (e.g., late `call-ended` after a timeout), the guard refs (`hasTerminated.current`) must prevent double-processing. See [CallContext debugging](#1-callcontext-the-worst).

### d) Connection config in memory

`NetworkConfig` generates a port and reads the IP on initialization, then keeps both in memory. On an IP change, it updates `ipAddress` immediately and calls the registered `onIpChange` callback after a three-second debounce so transports can rebind once.

Connection state is not handed to a second background process. The Android foreground service keeps the existing process and service instances alive while the app is backgrounded.

---

## Synchronization Logic

### Service → UI (Events mirrored to useState)
Services emit events; `CallContext` and other components subscribe in `useEffect` and copy into `useState`. Examples:
- `connectionService.on("call-ended", handler)` → `setCallState("ended")`
- `callService.on("remoteStream", handler)` → `setRemoteStreamUrl(stream.toURL())`
- `activeUserService.subscribe(listener)` → `setActiveIds(ids)`

**Cost:** every effect must guard for stale closures (`if (peerId !== incomingPeerId) return;`), manage unsubscribe cleanup, and decide on debouncing (e.g., `RemoteStreamVersion++` to trigger RTCView remount).

### In-memory ↔ secure-store (eager writes)
When a user changes a setting or a system value updates, write immediately to secure-store:
- `AppModeStore.setMode()` → `saveAppMode()` async
- `UserService.syncAuthenticatedUser()` → `setItemAsync("userUUID", ...)`

**Cost:** async writes that might fail silently because errors are logged but not propagated.

### DB ↔ Server (SyncService)
`SyncService` polls the server every 60s (or on demand), using `lastPulledAt` (stored in secure-store) to fetch only recent changes. Reads write back to WatermelonDB. See `docs/SYNC.md`.

### Cross-container reset (module-level globals)
When the user logs in again (`needsReloginForServer`), the `MainContainer` must be rebuilt with a fresh `AuthContainer`. This is coordinated via **module-level callback globals** in `main-container.ts`:

```typescript
let resetRequestedCallback: (() => void) | null = null;
export const requestMainContainerReset = () => resetRequestedCallback?.();

// In MainContainerProvider:
setResetRequestedCallback(() => {
  setRetryCount((n) => n + 1); // triggers rebuild
});
```

Similarly for password recovery (`setPendingPassword`). This is **implicit, mutable, global coupling** — non-obvious to trace.

---

## Offline Caching

1. **WatermelonDB** is the offline cache for domain data. UI reads from it regardless of network. Sync updates it when connectivity returns.

2. **secure-store** persists credentials, encryption keys, transport mode, sync progress, and the optional server host override. Authentication state can be rebuilt locally when the server is unavailable.

3. **Offline-auth fallback** (`auth-context.tsx:181–204`): when `refreshSession` fails with a network error, rebuild the session from the local `peers` row. Set `isOfflineWithExpiredToken` to warn the user.

4. **React Query** caches GPS and announcements but is **not wired to offline persistence**. If the app restarts while offline, queries lose their cache.

---

## Debugging Pain Points

### 1. CallContext (the worst)
**File:** `features/call/context/call-context.tsx` (751 lines)

**The problem:** Call state is reconstructed from many async events with guard refs, timers, and race conditions baked in.

**Key fragilities:**
- **Race: `call-ended` vs `peer-disconnected`.** `call-context.tsx:356–401` handles `call-ended` from WS. But if the signal is slow, `peer-disconnected` fires first. To tolerate this, `call-context.tsx:436–445` has a 1.5s timeout that assumes if the `call-ended` WS message hasn't arrived, the call was missed. This is a heuristic, not a guarantee.
- **Race: minimize vs terminate.** `call-context.tsx:165–186` skips cleanup if minimized. But if the user minimizes then force-kills the app, the call is orphaned. The 30s no-answer timeout (`call-context.tsx:592–600`) and auto-navigate-to-chat timeout (`call-context.tsx:606–616`) also assume call is in "calling" or "ended", so if the component unmounts during "calling", the cleanup doesn't fire.
- **Double-subscribe patterns.** `local-stream-ready` event fires after `resetCallState` (which sets `callState` to "calling"). But if the app lost the camera permission between calls, the event never fires. The retry loop at `call-context.tsx:548–575` polls for 5 attempts every 800ms. Brittle.
- **Ref-based state machine.** `hasSyncedMediaState.current` prevents double-sync when reconnecting, but it's only reset on `resetCallState`. If the component unmounts and remounts mid-call (due to navigation), the flag is stale.

**To debug:** Turn on `callLog` (env var `EXPO_PUBLIC_ENABLED_LOG_MODULES=call`). Then tail the log file:
```bash
tail -f $(node -e "require('expo').getLogPath()")
```
Watch for these sequences:
- `resetCallState` → `call › ready` → `startCall` → `call › connected` → `remote stream received` → `peer reconnected` or `call › remote ended`
- Stale logs will show events arriving out of order or being ignored due to guard checks.

### 2. UserStore (now reactive)
**File:** `features/shared/core/stores/user-store.ts` (60 lines)

**Fixed:** `UserStore` now has a subscriber pattern (`subscribe()` method and `listeners` Set). When `setIsRescuer()`, `setIsAdmin()`, or `setUser()` is called, all subscribers are notified. The `useUserStore()` hook uses `useSyncExternalStore` to ensure components re-render when store values change.

**Pattern:**
- `UserService` calls `userStore.setIsRescuer(value)` 
- UserStore emits via `this.emit()`
- `useUserStore()` hook's `useSyncExternalStore` triggers component re-render
- `AuthContext` subscribes and also re-renders

**To verify reactivity:** Use `useUserStore()` in a component and the values will update automatically.

### 3. MainContainer lifecycle (the rebuild dance)
**File:** `features/shared/core/context/main-container-context.tsx` (137 lines)

**The problem:** `main-container-context.tsx:76–82` deliberately omits `appModeStore` from the dependency array:

```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [userContainer, retryCount]);
```

The comment says:
> appModeStore intentionally omitted: services hold a direct reference and read mode reactively at call time, so no container rebuild is needed on mode changes. Including it races against post-login auth state updates and causes "Current user not initialized" crashes.

**The issue:** If `appModeStore` IS included, the `MainContainer` rebuilds on mode change. But if the user just logged in and `UserStore` hasn't been hydrated yet, `ConnectionService.getEffectiveMode(userStore.isGuest)` crashes. The fix is to NOT rebuild on mode change — services read `appModeStore.mode` directly at call time.

**But this means:** a mode change *won't* cause reconnection logic to re-run (e.g., if the user switches from "server" to "lan", the TCP server isn't restarted). The services must subscribe to mode changes internally or read it every time they check.

**To debug:** add a breakpoint in `MainContainerProvider` and note the dependency array. If you're trying to rebuild on mode change, this is where it will bite you.

### 4. Triple-sourced presence (useActivePeers)
**File:** `features/shared/hooks/use-active-users.ts` (92 lines)

**The problem:** "Is peer X online?" is answered from three sources:
1. `peers.is_online` column
2. `ActiveUsersService._activeIds` (WS server query)
3. TCP connection state (implicitly: if a TCP connection exists, the peer is reachable)

The reconciliation is **in one place**: `use-active-users.ts:82–91`. If you need to know why a peer is shown as online/offline, you must check:
- The app mode (LAN/server/auto)
- The peer's `is_online` flag in the DB
- Whether the WS presence API is enabled and what it returned
- Whether the peer has a TCP connection in `ConnectionService`

**To debug:** 
```bash
# Check what's in the peers table:
adb shell sqlite3 /data/user/0/com.sapot.android/databases/watermelon.db \
  "SELECT id, first_name, is_online FROM peers WHERE id='<peerId>';"

# Check what the WS layer sees:
grep "active-users" $(getLogPath) | tail -20

# Check what the connection service sees:
grep "connectToPeer\|tcpClientAdapters" $(getLogPath) | grep <peerId>
```

### 5. Two health contexts (conflicting status)
**Files:** `features/shared/core/context/health-context.tsx` vs `server-health-context.tsx`

**The problem:** Both are mounted. They read `appMode` and skip the health check if in LAN mode. But they use different polling hooks and expose different shapes. In a deeply nested tree, one part of the tree sees `useServerStatus()` and another sees `useServerHealth()`, and they might disagree.

**To debug:** search the codebase for both:
```bash
grep -r "useServerStatus\|useServerHealth" features app --include="*.tsx"
```
If you see both in use, verify they're saying the same thing.

---

## Recommendations

### 1. ✅ Make UserStore reactive (COMPLETED)
UserStore now has:
- `listeners: Set<UserStoreListener>` tracking subscribers
- `subscribe(listener)` and private `emit()` methods
- `useUserStore()` hook uses `useSyncExternalStore` for reactive reads
- AuthContext subscribes to UserStore changes via `setUserStoreVersion` 
- Mirrored useState for `isRescuer`, `isAdmin` removed from AuthContext
- Result: Single source of truth, no duplication, all reads are reactive

### 2. Merge the two health contexts
- Keep `ServerHealthProvider` (it has the right shape)
- Delete `HealthProvider`
- Consolidate the polling logic
- Rename to `useServerHealth()` only
- Fixes: conflicting answers, duplication, leftover console.log

### 3. Decompose CallContext ✅ DONE
- **Done:** Extracted 7 focused hooks under `features/call/context/hooks/`:
  - `useCallLifecycle` — `callState` machine, timers, reconnection, no-answer/ended-navigate
  - `useCallMediaState` — `localMic`, `localCam`, `remoteMic`, `remoteCam`, media toggles
  - `useCallTimer` — `elapsed` counter
  - `useAudioRoute` — `currentRoute` ref + speaker toggle
  - `usePeerInfo` — peer load + display name
  - `useRemoteStream` — remote stream URL/version/ready flag
  - `useLocalStream` — local cam lifecycle (init, retry, switch-cam)
- `CallProvider` is now ~170 lines; all hooks are independently tested (31 tests)
- `useCallContext()` and `CallContextValue` surface unchanged; both consumers compile

### 4. Replace module-level reset callbacks with an event or context method
- Add a `useMainContainerReset()` hook or `resetMainContainer()` method on the context
- Call it from `AuthProvider` when `needsReloginForServer`
- Makes the dependency explicit and traceable
- Fixes: implicit global coupling, hard-to-trace resets

### 5. Centralize presence logic
- Create a `usePeerPresence(peerId)` hook that encapsulates the merge logic
- Internally checks mode, DB, WS, and connection state
- Return a consistent shape: `{ online: boolean, sources: { db: boolean, ws: boolean, tcp: boolean }, mode: AppMode }`
- Fixes: triple-source reconciliation scattered across code, hard to debug

---

## Related Documents

- `docs/ARCHITECTURE.md` — service wiring and DI
- `docs/SYNC.md` — SyncService and lastPulledAt logic
- `docs/CONNECTION_MESSAGES.md` — WebSocket and data channel message types
- `docs/CALL_FLOW.md` — call lifecycle and state transitions
- `docs/DATABASE.md` — WatermelonDB schema and relationships
