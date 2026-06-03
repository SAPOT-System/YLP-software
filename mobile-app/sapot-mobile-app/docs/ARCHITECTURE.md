# Architecture

## Overview

SAPOT is a peer-to-peer mobile messenger. Peers communicate directly via WebRTC data channels (LAN) or via a server-relayed WebSocket (internet). A FastAPI backend handles auth, user search, and sync — it does **not** relay chat messages.

---

## Dependency Injection

All services are instantiated once at app startup through two container classes. They are **not singletons** — they are passed down via React context.

```
AuthContainer
  └── sessionStore
  └── userStore
  └── peerService
  └── peerRepository
  └── userService

MainContainer (receives AuthContainer)
  └── networkConfig
  └── appModeStore
  └── wsSignalingAdapter          (shared: signaling + public chat)
  └── tcpServerAdapter
  └── webrtcSessionManager
  └── signalingService
  └── callMediaService
  └── connectionService   ← constructed last (wires sub-services in constructor)
  └── chatService
  └── callService
  └── syncService
  └── repositories (message, conversation, call, etc.)
```

**Construction order matters.** `ConnectionService` is always constructed last because it wires sub-services via callbacks in its constructor.

React context provider: `features/shared/context/main-container-context.tsx`

---

## Service Map

| Service | Responsibility |
|---|---|
| `ConnectionService` | Central facade — owns TCP adapters, orchestrates WebRTC/signaling/media |
| `WebrtcSessionManager` | One `WebrtcAdapter` (RTCPeerConnection) per peer |
| `SignalingService` | Routes WebRTC SDP/ICE messages over TCP or WS |
| `CallMediaService` | Initializes and manages local mic/camera streams |
| `CallService` | Call lifecycle, audio routing (earpiece/speaker/Bluetooth) |
| `ChatService` | Message send/receive and persistence via WebRTC data channels |
| `DiscoveryService` | Zeroconf (mDNS) peer discovery on LAN. Publishes the local service idempotently and only marks it active after `ZeroconfAdapter` confirms publication. |
| `SyncService` | Pull-then-push sync with the server REST API. Triggered on app open, after send/ACK, and after call end. Tracks `lastPulledAt` in expo-secure-store. See `docs/SYNC.md`. |
| `CleanUpService` | Cleanup of stale data and connections |

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
"Reconnecting…" via the existing `"call-reconnecting"` event (`onCallReconnecting()`).

---

## Server Status

**Single source of truth:** `HealthProvider` (`features/shared/context/health-context.tsx`) mounts inside `app/(drawer)/_layout.tsx` and continuously tracks server reachability.

- Runs an immediate check via `checkBackEndHealth()` on mount, then polls `/ping` every 5s via `usePing()`
- Exposes `useServerStatus()` → `{ online: boolean; latency: number | null; shouldWarn: boolean }`
- `shouldWarn` is `true` only when `mode` is `server` or `auto` **and** the server is unreachable — LAN mode users are never warned

**Passive warning:** `ServerStatusBanner` (`features/shared/components/server-status-banner.tsx`) renders as an absolute-positioned overlay inside the drawer layout. It slides in from the top when `shouldWarn` is true and disappears automatically when the server comes back.

**Active guard:** `useServerAction()` (`features/shared/hooks/use-server-action.ts`) wraps imperative actions. When `shouldWarn` is true, it fires the caller-supplied `onBlocked` callback instead of proceeding.

```ts
const { isServerOffline } = useServerAction();
if (isServerOffline) { showToast("..."); return; }
```

Used in: `server-login.tsx`, `register/index.tsx`, `change-password.tsx`, `manage-profile.tsx`, `custom-drawer-content.tsx`, and all `forgot-password/` screens.

---

## Adapters

Thin injectable wrappers around native modules, allowing them to be replaced with mocks in tests.

| Adapter | Wraps |
|---|---|
| `TcpServerAdapter` | `react-native-tcp-socket` (server) |
| `TcpClientAdapter` | `react-native-tcp-socket` (client, one per peer) |
| `WsSignalingAdapter` | WebSocket with auto-reconnect + heartbeat — shared by `SignalingService`, `ConnectionService`, and `PublicChatService` |
| `WebrtcAdapter` | `react-native-webrtc` (RTCPeerConnection, one per peer) |
| `ZeroconfAdapter` | `react-native-zeroconf`. Tracks the active published service name, exposes publish confirmation via the native `published` event, and serializes scan/publish cleanup. |

---

## Feature Structure

```
features/<name>/
  services/       — Business logic
  repositories/   — WatermelonDB data access
  hooks/          — React hooks consuming services/stores
  components/     — UI components
  types.ts
  index.ts        — Public API
```

Features: `auth`, `announcements`, `call`, `chat`, `getting-started`, `settings`, `shared`, `sync`

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
2. **Secure storage handoff** — `features/shared/stores/secure-config.ts` persists `peerId`, `wsUrl`, TCP host/port, and local IP via `expo-secure-store`. `NetworkConfig` writes the latest IP immediately on WiFi change so the background task always reads fresh config. Background Zeroconf cleanup also uses the adapter-tracked published service name so teardown can unpublish the correct mDNS registration.

---

## Call UI State (`features/call/context/call-context.tsx`)

`CallProvider` / `useCallContext` owns the call lifecycle for call screens. Notable context values:

- `remoteStreamVersion: number` — increments each time a new remote stream arrives; use as a React key to force video component re-mount
- `localCam` / `remoteCam` — initialized to `false` for audio calls, `true` for video calls
- `handleToggleCam` — async; for audio-only calls, lazily acquires a video track via `WebrtcAdapter` on first toggle

`ConnectionServiceEvents` `"audio-call"` and `"video-call"` emit `{ peerId: string; callerName: string; conversationId?: string }`.

---

## Data Flow — Sending a Chat Message

```
User types message
  → ChatService.sendMessage()
    → WebrtcSessionManager.sendChatMessage()
      → WebrtcAdapter.sendData()  [WebRTC data channel]
        → Peer receives "chat" message
          → ChatService persists to WatermelonDB
```

> TCP is a planned fallback for chat — not yet implemented.
