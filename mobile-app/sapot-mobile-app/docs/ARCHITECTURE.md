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
| `DiscoveryService` | Zeroconf (mDNS) peer discovery on LAN |
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

## Adapters

Thin injectable wrappers around native modules, allowing them to be replaced with mocks in tests.

| Adapter | Wraps |
|---|---|
| `TcpServerAdapter` | `react-native-tcp-socket` (server) |
| `TcpClientAdapter` | `react-native-tcp-socket` (client, one per peer) |
| `WsSignalingAdapter` | WebSocket with auto-reconnect + heartbeat — shared by `SignalingService`, `ConnectionService`, and `PublicChatService` |
| `WebrtcAdapter` | `react-native-webrtc` (RTCPeerConnection, one per peer) |
| `ZeroconfAdapter` | `react-native-zeroconf` |

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

Features: `auth`, `call`, `chat`, `getting-started`, `settings`, `shared`, `sync`

---

## Background Task

On Android, a background task (`task/signaling-task.ts`) maintains WebSocket connectivity when the app is killed. It wakes every 15 minutes (Android minimum).

Two mechanisms coordinate foreground ↔ background:

1. **App-alive flag** — `setAppAlive(true)` in `MainContainer.initialize()` tells the background task to stand down. `setAppAlive(false)` on cleanup lets it resume.
2. **Secure storage handoff** — `features/shared/stores/secure-config.ts` persists `peerId`, `wsUrl`, TCP host/port, and local IP via `expo-secure-store`. `NetworkConfig` writes the latest IP immediately on WiFi change so the background task always reads fresh config.

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
