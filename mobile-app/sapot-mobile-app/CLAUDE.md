# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important

**Do not edit the FastAPI server code** in `server/`. It is included as a working directory for reference only.

**Keep documentation in sync.** When adding or updating features, APIs, messages, database tables, or services, update the relevant file in `docs/`:
- `docs/ARCHITECTURE.md` — new services, adapters, stores, DI wiring, transport changes
- `docs/CALL_FLOW.md` — new call message types or lifecycle changes
- `docs/API.md` — new or changed REST endpoints
- `docs/DATABASE.md` — schema changes (new tables, columns, enums)
- `docs/ENV_CONFIG.md` — new env vars, build variants, or secure storage keys
- `docs/TESTING.md` — new test utilities, mock patterns, or testing conventions
- `docs/CONNECTION_MESSAGES.md` — new WebSocket, TCP, or WebRTC data channel messages

---

## Repository Structure

- **`mobile-app/sapot-mobile-app/`** — React Native / Expo mobile app (primary working directory)
- **`server/`** — Python FastAPI backend (read-only reference)

---

## Mobile App Commands

```bash
# Start dev server (sets APP_VARIANT=development)
npm run dev

# Prebuild and run on Android device/emulator
npm run prebuild          # expo prebuild --clean for development variant
npm run android           # run with dev app-id

# EAS cloud builds
npm run android:dev       # development profile
npm run android:prev      # preview profile
npm run android:prod      # production profile

# TypeScript type check
npm run typecheck

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx jest path/to/test.ts

# Run tests matching a name pattern
npx jest --testNamePattern="pattern"
```

---

## Architecture

### Dependency Injection Containers

The app uses manual DI via two container classes:

- **`AuthContainer`** (`features/auth/auth-container.ts`) — owns auth state: `sessionStore`, `userStore`, `peerService`, `peerRepository`, `userService`
- **`MainContainer`** (`features/shared/main-container.ts`) — constructed with an `AuthContainer`, wires together all runtime services and repositories. This is the single point of initialization for the app.

Services are not singletons — instantiated once in `MainContainer` and passed down via React context (`features/shared/context/main-container-context.tsx`).

**Construction order matters.** `ConnectionService` is constructed last because it wires sub-services in its constructor via callbacks (`.setTcpCallbacks()`, `.setSignalingSender()`). Callbacks use closures instead of `.bind()` so `jest.spyOn` replacements on the instance are respected in tests.

### Feature Structure

```
features/<name>/
  services/       # Business logic
  repositories/   # WatermelonDB data access
  hooks/          # React hooks consuming services/stores
  components/     # UI components
  types.ts
  index.ts        # Public API
```

Features: `auth`, `call`, `chat`, `getting-started`, `settings`, `shared`, `sync`

### Core Services (`features/shared/services/`)

- **`ConnectionService`** — central P2P facade. Manages `TcpClientAdapter` per peer, orchestrates `WebrtcSessionManager`, `SignalingService`, and `CallMediaService`. Extends `TypedEventEmitter<ConnectionServiceEvents>`, emitting typed call/stream/connection events. Three transport modes: `auto` (WS first, TCP fallback), `server` (WS only), `lan` (TCP only). Mode is driven by `AppModeStore`.
- **`WebrtcSessionManager`** — manages one `WebrtcAdapter` (RTCPeerConnection) per peer. Forwards events (`remoteStream`, `peer-reconnected`, `camera-on`, etc.) up to `ConnectionService`.
- **`SignalingService`** — routes WebRTC SDP/ICE messages. Sends via TCP (direct) or WS (relay), enforcing mode constraints.
- **`CallMediaService`** — initializes and manages local media streams (mic/camera).
- **`DiscoveryService`** — Zeroconf (mDNS) peer discovery on the local network.
- **`ChatService`** — message send/receive and persistence to WatermelonDB via data channels.
- **`CallService`** — audio/video call lifecycle. Manages audio routes (earpiece/speaker/Bluetooth) via `react-native-incall-manager`.
- **`SyncService`** — periodic sync of local data with the server REST API.

### Adapters (`features/shared/adapters/`)

Thin injectable wrappers around native modules for testability:

| Adapter | Wraps |
|---|---|
| `TcpServerAdapter` / `TcpClientAdapter` | `react-native-tcp-socket` |
| `WsSignalingAdapter` | WebSocket with auto-reconnect + heartbeat (signaling relay via server) |
| `ZeroconfAdapter` | `react-native-zeroconf` |
| `WebrtcAdapter` | `react-native-webrtc` |

### Background Task Integration

The app supports Android background connectivity via `expo-background-task` + `expo-task-manager` (`task/signaling-task.ts`).

Two mechanisms coordinate foreground and background:

1. **App-alive flag** — `setAppAlive(true)` in `MainContainer.initialize()` tells the background task to stand down. On cleanup, `setAppAlive(false)` lets the task resume.
2. **Secure storage handoff** — `features/shared/stores/secure-config.ts` persists `peerId`, `wsUrl`, TCP host/port, and local IP via `expo-secure-store`. `NetworkConfig` writes updated IP immediately on WiFi change so the background task always reads the latest config on wake.

The background task wakes every 15 minutes (Android minimum) and uses the stored config to maintain connectivity when the app is killed.

### Local Database

WatermelonDB with SQLite. Schema (`features/shared/database/schema.ts`, version 6) tables: `guest_user`, `peers`, `messages`, `calls`, `call_participants`, `message_receipts`, `conversations`, `conversation_participants`. Migrations in `features/shared/database/migrations.ts`.

### Logging

Scope-based logger via `react-native-logs` + Reactotron (`features/shared/utils/logger.ts`). Each module uses a named scope (e.g., `connectionLog`, `networkLog`, `backgroundLog`). Control which scopes print at runtime via the env var:

```
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background
```

Leave unset to enable all scopes.

### Environment / Config

`config/runtime.ts` resolves API and WebSocket base URLs:
- `__DEV__` → `http://<DEV_HOST>:8000` — update `DEV_HOST` here for local development
- EAS channels `preview` / `production` → `https://sapot.online`

### Testing

Global mocks for WatermelonDB, TCP sockets, WebRTC, Zeroconf, Expo modules, and react-native-paper are configured in `jest-setup.js`. Test utilities (builders, factories, mocks) live in `test/`. Path alias `@/` maps to the project root.

---

## Server Reference (read-only)

The FastAPI server (`server/app/`) provides:
- REST endpoints: auth, user management, GPS, peer connections, profile pictures, sync, admin
- WebSocket signaling endpoint (`/ws`) — relays WebRTC `offer`/`answer`/`ICE` messages between peers via `connection_manager.py`
- Static file serving from `static/profile_pictures/`

## Conventions
- Screens in app/ using Expo Router file-based routing
- Use useTheme() for dark mode
- Always handle permission states (not asked, denied, granted)
- Always handle offline state gracefully
- Safe area insets on all screens
- Always run `npx tsc --noEmit` after making TypeScript changes to catch type errors before presenting the result as done.
- When fixing bugs, provide the fix directly and concisely. Avoid lengthy investigation narratives before showing the solution.
- This is a React Native TypeScript project. Always use proper TypeScript types—never use `unknown` or `any` for callback parameters when the type can be inferred from context.


## Don'ts
- Don't eject from Expo managed workflow
- Don't use AsyncStorage for sensitive data (use expo-secure-store)
- Don't hardcode dimensions — use flex layouts