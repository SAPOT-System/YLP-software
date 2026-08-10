# Architecture

## Overview

SAPOT is a peer-to-peer mobile messenger. Peers communicate directly via WebRTC data channels (LAN) or via a server-relayed WebSocket (internet). A FastAPI backend handles auth, user search, and sync — it does **not** relay chat messages.

---

## Dependency Injection

All services are instantiated once at app startup through two container classes. They are **not singletons** — they are passed down via React context.

### AuthContainer (`features/auth/auth-container.ts`)

Owns auth-persistent state that outlives individual screens. Constructed before `MainContainer`,
and takes no arguments:

- `sessionStore` — WebSocket session handle
- `userStore` — current user identity (`Peer | GuestUser`)
- `peerService` / `peerRepository`
- `guestUserRepository` — guest profile row
- `guestMigrationService` — guest→auth conversion
- `userService` — login/logout; `MainContainer` injects the `CleanUpService` into it so logout purges local data

### MainContainer (`features/shared/main-container.ts`)

Single wiring point for all runtime services. Constructed as
`new MainContainer(authContainer, appModeStore)` — the `AppModeStore` is a second constructor
argument, not something it creates, because the transport mode is chosen before the container exists.

**Construction order is explicit and load-bearing** for the connection layer:
```
WebrtcSessionManager → SignalingService → CallMediaService → ConnectionService
```

`ConnectionService` is constructed last *of that group* because its constructor wires those
sub-services via callbacks (`signalingService.setTcpCallbacks(...)`,
`webrtcSessionManager.setSignalingSender(...)`). It is **not** the last thing the container
builds — the data/chat/call layer (`ConversationKeyStore`, `MessageRepository`, `SyncService`,
`ConversationKeyManager`, `ChatService`, `PublicChatService`, `CallService`, `CleanUpService`)
is constructed after it and attached via the setters below.

Callbacks use closures (not `.bind()`) so `jest.spyOn` replacements on instances are respected
in tests.

**Two wiring patterns exist for cross-service dependencies:**

1. **Constructor injection** — the default. Use it whenever the dependency already exists at the
   point the consumer is built.
2. **Post-construction setters** — used only where constructor injection would create a cycle.
   The complete set in `main-container.ts` is:
   ```typescript
   connectionService.setChatService(this.chatService);
   connectionService.setCallService(this.callService);
   connectionService.setPeerService(this.userContainer.peerService);
   discoveryService.setChatService(this.chatService);
   discoveryService.setConnectionService(this.connectionService);
   userContainer.guestMigrationService.setMessageRepository(this.messageRepository);
   userContainer.userService.setCleanUpService(this.cleanUpService);
   ```

**Which pattern applies to a new dependency:** if the dependency is constructed *before* its
consumer, pass it to the constructor. Reach for a setter only when the two services need each
other — `ConnectionService` is built before `ChatService` (which depends on it), so the reverse
edge has to be a setter. A setter that isn't resolving a cycle is a constructor argument in
disguise.

**`initialize()` phase decomposition** — the public `initialize()` delegates to three typed private phases:

| Phase | Method | Role |
|---|---|---|
| 1 | `initializeKeys(): Promise<KeysReady>` | Loads all crypto keys (local encryption, ECDH, peer keys, conversation keys). Clears pending password. |
| 2 | `handleMigration(keys): Promise<MigrationOk>` | Detects and runs migration recovery re-encrypt; computes `migrationPushPending` flag. |
| 3 | `startNetworkServices(migOk): Promise<void>` | Starts sync, NetInfo listener, periodic timer, AppState listener, network config watching. |

Branded token types (`KeysReady`, `MigrationOk`) make phase ordering a TypeScript compile-time constraint — phase 2 cannot be called without a `KeysReady` token, and phase 3 cannot be called without a `MigrationOk` token.

React context provider: `features/shared/core/context/main-container-context.tsx`


---

## Encryption

### In Transit

- **TCP**: `TcpEncryptionService` wraps/unwraps `EncryptedEnvelope` using NaCl box (peer ECDH keys; no master key needed)
- **WebSocket**: `WsEncryptionService` encrypts signaling payloads so the relay server cannot read them

### At Rest

- Chat messages are encrypted per-conversation using ECDH-derived NaCl box keys
- `ConversationKeyStore` (`features/chat/repositories/conversation-key-store.ts`) holds
  `conversationKeys` (current) and `conversationKeyHistory` (up to `MAX_KEY_HISTORY = 5` past
  keys per conversation) so messages still decrypt after a peer rotates keys. It is injected
  into `MessageRepository`, `ConversationKeyManager` and `ChatService` rather than owned by any
  one of them — `getCandidateKeys()` returns current-plus-history for decrypt attempts.
- Conversation keys are in-memory only; `clearConversationKeys()` drops them on logout

### Key Storage

- Master key + signaling key: `expo-secure-store` (via `key-derivation.ts`)
- Peer ECDH public keys: fetched from server (auth users) or via TCP handshake; cached in `PeerKeyStore`
- Recovery: `KeyRecoveryService` wraps master key under multiple recovery methods (password, phone, email, QA token)

### Guest→Auth Migration

1. `GuestMigrationService` captures guest conversation keys before clearing them
2. `MessageRepository` re-encrypts all messages with new auth ECDH keys
3. `skipEncryptedMessageUpdatesOnNextSync()` prevents the server's stale guest-key ciphertext from overwriting the newly re-encrypted local copy on the first sync after migration

Crypto stack: `tweetnacl` + `tweetnacl-util`, `@noble/hashes`, `expo-crypto`, `react-native-quick-crypto`

---

## Initialization Flow (`MainContainer.initialize()`)

1. Load master key, signaling keys, peer ECDH keys from secure storage
2. Detect and complete any interrupted guest→auth re-encryption
3. Start sync — periodic REST API sync, or LAN-only one-time push (mode-dependent)
4. Register NetInfo + AppState listeners
5. Idempotent via `this.initPromise` guard — safe to call multiple times

---

## Service Map

| Service | Responsibility |
|---|---|
| `ConnectionService` | Central facade — owns TCP adapters, orchestrates WebRTC/signaling/media. `prepareCallSignaling()` opens only the WS/TCP invitation path; `connectToPeer()` starts WebRTC after acceptance. |
| `WebrtcSessionManager` | One `WebrtcAdapter` (RTCPeerConnection) per peer |
| `SignalingService` | Routes WebRTC SDP/ICE messages over TCP or WS |
| `CallMediaService` | Initializes and manages local mic/camera streams |
| `CallService` | **Facade.** Call session lifecycle (the `callSessions` map, busy/ready glare handling, inbound/outbound flow). Owns the pre-registered, `callId`-correlated ready handler so screen navigation cannot lose an immediate answer. Audio-route management delegated to `CallAudioService`; call-log build and persist delegated to `CallLogService`. `// TODO(refactor): extract CallSessionService` — the `callSessions` state machine should move to a `CallSessionService` to push `call-service.ts` under 800 lines, deferred to avoid splitting a live state machine. |
| `ChatService` | Facade: delegates to `ChatReceiveService` (incoming/ACK/seen) and `ChatMessageService` (send/status/resend) over a shared `MessageAckTracker`. Persists via WebRTC data channels. |
| `ConversationKeyManager` | ECDH key derivation per conversation — `deriveAndSetConversationKey`, `preloadAllConversationKeys`, `rederiveKeyForPeer` |
| `DiscoveryService` | Zeroconf (mDNS) peer discovery on LAN. Publishes the local service idempotently and only marks it active after `ZeroconfAdapter` confirms publication. |
| `SyncService` | Pull-then-push sync with the server REST API. Triggered on app open, after send/ACK, and after call end. Tracks `lastPulledAt` in expo-secure-store. See `docs/SYNC.md`. |
| `CleanUpService` | Cleanup of stale data and connections. Injected into `AuthContainer`'s `UserService` so logout purges local data. |
| `UserService` | Owned by `AuthContainer`. User initialization and identity persistence — ensures a user row exists and is published to `SessionStore`/`UserStore`; owns `logout`. |
| `ActiveUsersService` | Live presence. Subscribes to the `active-users` event on `WsSignalingAdapter` and re-polls every 10 s (`pollIntervalMs`, constructor-overridable). |
| `NotificationService` | Local incoming-call notifications via `expo-notifications`. Constructed inline in `main-container.ts` and passed to `ConnectionService`; not exposed as a container field. |
| `CallMessageRouter` | Pure decision layer for inbound call messages. Maps a `CallMessage` + busy/active state to a `CallRouterResult` (`emit` / suppress), keeping glare handling out of `ConnectionService`. |
| `PublicChatService` | Server-relayed public chat over `WsSignalingAdapter`, with history loaded from `GET /public-chat`. Independent of the P2P chat path. |

---

## Transport Modes

Controlled by `AppModeStore`. Mode is determined by user settings and guest status.

| Mode | Transport Used | When |
|---|---|---|
| `server` | WebSocket only | Internet, authenticated users |
| `lan` | TCP only | Local network |
| `auto` | WS first, TCP fallback | Default |

Guards in `ConnectionService`:
- `isWebSocketAllowed()` — checks `AppModeStore` + guest status
- `isTcpAllowed()` — checks `AppModeStore` + guest status

---

## Presence & Last-Seen

Live presence is a list of currently-connected user IDs from the WS signaling server
(`ActiveUsersService` ↔ `get-active-users`), surfaced via `useIsUserActive`.

For **"Last seen …"** when a peer is offline, the server stamps `UserActivity.last_active`
(+`status`) on WS connect/disconnect (`app/api/peer_connection.py` → `set_user_status`) and exposes
`last_active` through `GET /user-utils/search-user/{id}`. The chat screen calls
`PeerService.refreshLastSeen(peerId)` while a peer is offline, persisting the value to
`peers.last_seen_at`; LAN/mDNS online/offline transitions also stamp `last_seen_at` as a fallback.
`setPeerLastSeen` keeps the newest of the two sources. The header renders
`Last seen <formatRelativeTime(lastSeenAt)>`.

---

## Peer Re-discovery & Dynamic Addressing

`PeerService.register()` keeps the in-memory `discoveredPeerServices` cache (port/IP per
peer) in sync on **every** mDNS `serviceResolved`, not just first sight. If a peer restarts its
TCP server on a new port and re-advertises under the same id, the cached address is overwritten
and `register()` returns `{ addressChanged: true }`.

When the address changes, `DiscoveryService` calls
`ConnectionService.handlePeerRediscovered(peerId)`, which:
1. Evicts the stale `TcpClientAdapter` (`evictTcpClientAdapter` — disconnects the dead socket and
   removes it from the map so the next connect builds a fresh one at the new address), and
2. Emits the `"peer-rediscovered"` event.

`ChatService` exposes this via `onPeerRediscovered()`. The chat screen
(`app/(drawer)/(tabs)/chat/[id].tsx`) subscribes and re-dials the peer, so a port change is
honored without leaving the conversation. The chat screen also re-dials on `NetInfo`
network-regained and exposes a manual "Tap to retry" once the bounded reconnect budget
(`MAX_RECONNECT_RETRIES`) is exhausted. Mid-session ICE disruption (weak WiFi) surfaces as
"Reconnecting…" via the existing `"call-reconnecting"` event (`onCallReconnecting()`) — only
for a call that already reached `"connected"`; see [CALL_FLOW.md](./CALL_FLOW.md#7-reconnecting).

`NetworkConfig` also distinguishes the initial online state from a genuine offline → online
transition. On network regain it notifies `MainContainer` immediately, even when DHCP returns
the same IP address. `SignalingService.restartWsSignalingAfterNetworkRegain()` then invalidates
the old native WebSocket and starts a fresh connection. `WsSignalingAdapter` preserves its
outbound queue during this transport reset, so a call started immediately after Wi-Fi returns
is queued and flushed through the replacement socket instead of being written to a zombie
`OPEN`/`CONNECTING` transport.

---

## Server Status

> **There are two health contexts, not one.** Both are mounted, nested, in
> `app/(drawer)/_layout.tsx` (`<ServerHealthProvider><HealthProvider>…`). This is known
> duplication — see [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md#b-two-redundant-health-contexts).
> Pick the right one for what you're building; don't assume a single source of truth.

| Context | Hook | Exposes | Mounted in | Used by |
|---|---|---|---|---|
| `HealthProvider` (`core/context/health-context.tsx`) | `useServerStatus()` | `{ online, latency, shouldWarn }` | drawer only | `useServerAction()`, debug panel |
| `ServerHealthProvider` (`core/context/server-health-context.tsx`) | `useServerHealth()` | `{ online, initialChecked }` | drawer, `auth/`, `getting-started/` | `ServerStatusBanner`, `ServerHealthBanner`, `ServerDownReloginTransition` |

`HealthProvider` runs an immediate `checkBackEndHealth()` on mount, then polls `/ping` every 5 s
via `usePing()`. Its `shouldWarn` is `true` only when the effective mode is `server` or `auto`
**and** the server is unreachable — LAN-mode users are never warned.

`ServerHealthProvider` is the one that survives outside the drawer, which is why the unauthenticated
`auth/` and `getting-started/` layouts use it.

**Passive warning:** `ServerStatusBanner` (`features/shared/components/server-status-banner.tsx`)
renders as an absolute-positioned overlay inside the drawer layout. It reads `useServerHealth()`
and computes its own warn condition (`initialChecked && isServerMode && !online`) rather than
reusing `HealthProvider`'s `shouldWarn`. It also waits 10 s after mount before it can appear, and
suppresses itself while `OfflineExpiredBanner` is showing.

`ServerHealthBanner` is the sibling used in the auth/getting-started layouts, with a 5.5 s delay
and no mode gating.

**Active guard:** `useServerAction()` (`features/shared/hooks/use-server-action.ts`) reads
`useServerStatus().shouldWarn` and returns two things:

```ts
const { guardAction, isServerOffline } = useServerAction();

// Wrap an action — onBlocked fires instead of the action, which resolves to undefined
const submit = guardAction(async () => saveProfile(form), () => showToast("Server unreachable"));

// Or branch directly
if (isServerOffline) { showToast("..."); return; }
```

`isServerOffline` is simply `shouldWarn` re-exported under an action-oriented name.

Used in `change-password.tsx`, `manage-profile.tsx`, and `phone/edit-phone.tsx` — all under
`app/(drawer)/settings/account/`. The unauthenticated screens (`auth/`, `getting-started/`) cannot
use it, because `HealthProvider` is mounted only inside the drawer; they rely on
`ServerHealthBanner` instead.

---

## Adapters

Thin injectable wrappers around native modules, allowing them to be replaced with mocks in tests.

| Adapter | Wraps |
|---|---|
| `TcpServerAdapter` | `react-native-tcp-socket` (server) |
| `TcpClientAdapter` | `react-native-tcp-socket` (client, one per peer) |
| `WsSignalingAdapter` | WebSocket with auto-reconnect + heartbeat — shared by `SignalingService`, `ConnectionService`, and `PublicChatService` |
| `WebrtcAdapter` | **Facade.** `react-native-webrtc` (RTCPeerConnection, one per peer). Liveness ping/pong probing now delegated to `LivenessMonitor`; ICE-restart backoff delegated to `IceRestartController`. Both sub-units are driven by the adapter via injected closures (no direct adapter reference). `// TODO(refactor): extract local-media-controls` — `initializeLocalStream*`, `toggleMic`, `toggleCamera`, `switchCamera`, `getLocalStream` share `peerConnection`/`localStream` with `createPeerConnection`/`cleanup`, so this split is deferred to avoid a PC-core split; reaching <800 lines is possible once that seam is clean. |
| `LivenessMonitor` | Application-level data-channel ping/pong probe, extracted from `WebrtcAdapter`. Detects half-open links and triggers ICE restart via closures. |
| `IceRestartController` | ICE-restart scheduling and exponential-backoff logic, extracted from `WebrtcAdapter`. Drives `createOffer({ iceRestart: true })` and emits `signal-offer`/`ice-restarting`/`connection-failed` via closures. |
| `ZeroconfAdapter` | `react-native-zeroconf`. Tracks the active published service name, exposes publish confirmation via the native `published` event, and serializes scan/publish cleanup. |
| `ws-message-parser.ts` | Not an adapter class — the pure decoder `WsSignalingAdapter` uses to turn a raw frame into a discriminated `WsEvent` (`signaling` / `chat` / `ack` / `call` / `sms` / public-chat). Kept separate so frame parsing is testable without a socket. |

Two helper modules sit alongside the connection services rather than in this table:

- **`connect-planning.ts`** — pure connect-strategy helpers: per-mode dial timeouts
  (`LAN_CONNECT_TIMEOUT_MS` 7 s, `SERVER_CONNECT_TIMEOUT_MS` 15 s, `AUTO_CONNECT_TIMEOUT_MS` 10 s),
  `MAX_CONNECT_RETRIES`, and `dedupeCandidateAddresses()` for dual-homed peers.
- **`service-interfaces.ts`** — the structural interfaces (`setSignalingSender`, `setTcpCallbacks`,
  `IChatMessageHandler`, …) that let `ConnectionService` depend on shapes rather than concrete
  classes, which is what makes the setter wiring above mockable.

---

## Feature Structure

Domain features follow a by-type layout:

```
features/<name>/
  services/       — Business logic
  repositories/   — WatermelonDB data access
  hooks/          — React hooks consuming services/stores
  components/     — UI components
  types.ts
  index.ts        — Public API
```

`features/` is not flat — features differ enormously in size and complexity:

Sizes below include tests and are indicative, not exact — they drift with every change. Regenerate with:

```bash
find features -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + \
  | awk '{split($2,a,"/"); if(a[1]=="features" && a[2]!="") {s[a[2]]+=$1; c[a[2]]++}} \
         END {for(k in s) printf "%-18s %6d lines %4d files\n", k, s[k], c[k]}' | sort -k2 -rn
```

| Feature | Lines | Files | Role |
|---|---|---|---|
| `shared/` | ~24 k | 176 | **Engine** — P2P runtime, encryption, DI, database |
| `chat/` | ~7.6 k | 46 | Message threads, sync, conversation key management |
| `auth/` | ~6.1 k | 67 | Registration, login, guest flow |
| `call/` | ~4.9 k | 38 | Audio/video call UI and lifecycle |
| `debug/` | ~3.9 k | 27 | Developer debug panel (dev/QA-only) |
| `sync/` | ~3.3 k | 16 | Background data sync with server |
| `gps/` | ~1.2 k | 18 | Live location sharing (rescuers only) |
| `settings/` | ~0.6 k | 5 | User preferences |
| `announcements/` | ~0.4 k | 9 | Server-fetched announcement board |
| `getting-started/` | ~0.4 k | 8 | Onboarding screens |

`debug/` is gated by `config/debug.ts` and ships only in dev/QA builds: `DebugDbService` provides
a WatermelonDB table browser/seeder/reset plus JSON export-import over the shared `database`
instance; `DebugAuthService` (Auth/Users section) seeds test users and switches roles via
`UserService`/`UserStore`, injects/clears a fake JWT via `secure-config`, and drives
force-logout/reset via `UserService.logout`/`wipeDatabase`.

`features/shared/` is ~45 % of all production code. It is a layered engine, not a utility bucket. See the sub-domain layout below and `features/shared/README.md` for the one-page map.

### Engine Sub-domains (`features/shared/`)

Four sub-domains in dependency order (bottom → top):

| Sub-domain | Path | Lines | What lives here |
|---|---|---|---|
| **core** | `shared/core/` | ~4.1 k | Logger, errors, context, WatermelonDB schema/models, stores, API client |
| **crypto** | `shared/crypto/` | ~1.7 k | NaCl E2E encryption, key derivation, key recovery, at-rest encryption |
| **peer** | `shared/peer/` | ~1.7 k | `PeerService`, `PeerRepository`, `GuestUserRepository` |
| **connection** | `shared/connection/` | ~11.6 k | `ConnectionService`, WebRTC, signaling, TCP/WS adapters, discovery |

`shared/` also holds two presentation-layer directories that are not part of the dependency
ladder above: `shared/components/` (~1.8 k, cross-feature UI such as `ServerStatusBanner`) and
`shared/hooks/` (~1.3 k, the React entry points to the engine — `use-main-container`,
`use-connection-service`, `use-server-action`, …), plus `main-container.ts` itself (~0.6 k).

**One-way dependency rule:** `core` ← `crypto` ← `peer` / `connection` ← domain features. A
sub-domain may only import from itself and sub-domains *below* it. This holds strictly today:
neither `crypto/` nor `peer/` imports `connection/`.

**The engine → domain-feature direction is the weaker rule**, and it is not currently absolute.
Known inbound edges from `shared/` into domain features:

| Importer | Imports | Why |
|---|---|---|
| `main-container.ts` | `chat/`, `call/`, `sync/` | Structural. The DI composition root must name every concrete type it wires — this one is expected and not a leak. |
| `shared/components/*`, `shared/core/context/*`, `shared/hooks/*` | mostly `auth/` | Cross-feature UI and context that render or read auth state. Tolerated. |
| `shared/connection/services/clean-up-service.ts` | `@/features/chat` | Leak — an engine service reaching up into a domain feature. |
| `shared/types.ts` | `@/features/chat/types` (`DataChatMessageI`) | Leak — the engine's own message type is defined in `chat/`. |
| `shared/core/api/user-profile.api.ts` | `@/features/auth/utils/validation` (`toLocalPhone`) | Leak — a shared util that belongs in `core/`. |

Treat the last three as debt, not precedent: when you touch them, move the shared type or util
down into `shared/`, don't add a fourth. Before adding any new `shared/ → features/<name>/`
import, check whether the thing being imported actually belongs in `shared/`.

### `features/announcements/`

Server-fetched announcement board — no WatermelonDB, purely React Query.

- **`api.ts`** — `getAnnouncements()` calls `GET /user-utils/get-announcements` via the shared Axios client. Returns role-filtered, active, non-expired announcements.
- **`hooks/use-announcements.ts`** — `useQuery` wrapper with a 2-minute stale time.
- **`hooks/use-announcement-new-count.ts`** — Tracks unseen count by persisting `announcements_last_seen_at` timestamp in `expo-secure-store`. Exposes `newCount` and `markAllSeen()`.
- **`components/announcement-card.tsx`** — Card UI with priority-colored header band (`high`→red, `normal`→amber, `low`→gray) and content body.
- **`components/announcement-list-row.tsx`** — Chat-list entry row (matches Figma node 2274:6335). Shows unread badge; navigates to `/(drawer)/announcements`.
- **Screen:** `app/(drawer)/announcements.tsx` — FlatList of cards with priority filter chips (`All`, `High`, `Medium`, `Low`) and a "N new" badge in the header. Calls `markAllSeen()` on mount.

---

## Background Task

On Android, a background task (`task/signaling-task.ts`) maintains WebSocket connectivity when the app is killed. It wakes every 15 minutes (Android minimum).

Two mechanisms coordinate foreground ↔ background:

1. **App-alive flag** — `setAppAlive(true)` in `MainContainer.initialize()` tells the background task to stand down. `setAppAlive(false)` on cleanup lets it resume.
2. **Secure storage handoff** — `features/shared/core/stores/secure-config.ts` persists `peerId`, `wsUrl`, TCP host/port, and local IP via `expo-secure-store`. `NetworkConfig` writes the latest IP immediately on WiFi change so the background task always reads fresh config. Background Zeroconf cleanup also uses the adapter-tracked published service name so teardown can unpublish the correct mDNS registration.

---

## Call UI State (`features/call/context/call-context.tsx`)

`CallProvider` / `useCallContext` owns the call lifecycle for call screens. Notable context values:

- `remoteStreamVersion: number` — increments each time a new remote stream arrives; use as a React key to force video component re-mount
- `localCam` / `remoteCam` — initialized to `false` for audio calls, `true` for video calls
- `handleToggleCam` — async; for audio-only calls, lazily acquires a video track via `WebrtcAdapter` on first toggle

`ConnectionServiceEvents` `"audio-call"` and `"video-call"` emit `{ peerId: string; callerName: string; conversationId?: string; callId?: string }`.
`"call-ready"` emits `{ peerId: string; callId: string }`; only `CallService` consumes it to start the matching session.

---

## Data Flow — Sending a Chat Message

`ConnectionService.sendChatMessage()` picks the transport and returns which one it used
(`"webrtc" | "ws"`):

```
User types message
  → ChatService.sendChatMessage()
    → ConnectionService.sendChatMessage(peerId, messageData)
      │
      ├─ data channel open?  → WebrtcSessionManager.sendChatMessage()
      │                         → WebrtcAdapter.sendData()   [WebRTC data channel]  ⇒ "webrtc"
      │
      └─ no data channel:
           ├─ effective mode === "lan" → throws
           │    ("No data channel and WS not allowed in lan mode")
           └─ otherwise                → SignalingService.sendChatMessage()
                                          → WsSignalingAdapter  [server relay]      ⇒ "ws"
        → Peer receives "chat" message
          → ChatService persists to WatermelonDB
```

The WS relay is a real, implemented fallback — the server forwards the (E2E-encrypted) payload
without being able to read it. Callers can force it with `{ forceWebSocket: true }`, which
`tryResendMessage` uses when retrying.

In `lan` mode there is no fallback by design: the send throws rather than routing a LAN-only
conversation through the server. Callers must surface that as a failed send.

> A direct TCP fallback for chat is still unimplemented — `lan` mode relies on the WebRTC data
> channel alone. TCP currently carries signaling and the key handshake, not chat payloads.
