# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important

The FastAPI server code in `server/` may be edited when the user explicitly requests a backend change.

**Keep documentation in sync.** When adding or updating features, APIs, messages, database tables, or services, update the relevant file in `docs/`:
- `docs/ARCHITECTURE.md` — new services, adapters, stores, DI wiring, transport changes
- `docs/CALL_FLOW.md` — new call message types or lifecycle changes
- `docs/API.md` — new or changed REST endpoints
- `docs/DATABASE.md` — schema changes (new tables, columns, enums)
- `docs/SYNC.md` — sync strategy, triggers, and `lastPulledAt` tracking
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

# EAS OTA updates (push JS bundle without full build)
npm run update:dev        # push to development channel
npm run update:prev       # push to preview channel
npm run update:prod       # push to production channel

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

Features: `auth`, `call`, `chat`, `getting-started`, `gps`, `settings`, `shared`, `sync`

### Core Services (`features/shared/services/`)

- **`ConnectionService`** — central P2P facade. Manages `TcpClientAdapter` per peer, orchestrates `WebrtcSessionManager`, `SignalingService`, and `CallMediaService`. Extends `TypedEventEmitter<ConnectionServiceEvents>`, emitting typed call/stream/connection events. Three transport modes: `auto` (WS first, TCP fallback), `server` (WS only), `lan` (TCP only). Mode is driven by `AppModeStore`.
- **`WebrtcSessionManager`** — manages one `WebrtcAdapter` (RTCPeerConnection) per peer. Forwards events (`remoteStream`, `peer-reconnected`, `camera-on`, etc.) up to `ConnectionService`.
- **`SignalingService`** — routes WebRTC SDP/ICE messages. Sends via TCP (direct) or WS (relay), enforcing mode constraints.
- **`CallMediaService`** — initializes and manages local media streams (mic/camera).
- **`DiscoveryService`** — Zeroconf (mDNS) peer discovery on the local network.
- **`ChatService`** — message send/receive and persistence to WatermelonDB via data channels.
- **`CallService`** — audio/video call lifecycle. Manages audio routes (earpiece/speaker/Bluetooth) via `react-native-incall-manager`.
- **`SyncService`** — periodic sync of local data with the server REST API.
- **`CleanUpService`** — purges stale peers, messages, and conversations. Wired into `UserService` so cleanup runs on logout.

### Adapters (`features/shared/adapters/`)

Thin injectable wrappers around native modules for testability:

| Adapter | Wraps |
|---|---|
| `TcpServerAdapter` / `TcpClientAdapter` | `react-native-tcp-socket` |
| `WsSignalingAdapter` | WebSocket with auto-reconnect + heartbeat (signaling relay via server) |
| `ZeroconfAdapter` | `react-native-zeroconf` |
| `WebrtcAdapter` | `react-native-webrtc` |

### GPS Feature (`features/gps/`)

Live location sharing with server-side relay — independent of the P2P transport.

- **`GpsLocationService`** — opens a dedicated WebSocket to `/gps/ws/<userId>`, watches device position via `expo-location`, and streams `{ lat, lng }` updates. Auto-reconnects on disconnect (3 s delay). Does **not** go through `ConnectionService`.
- **`useGpsStreaming`** — starts/stops `GpsLocationService` based on auth state and user preference. Only runs for authenticated, non-guest users with sharing enabled.
- **`useLatestLocations`** — polls `GET /gps/latest` every 5 s via React Query; used to render other rescuers on the map.
- **`GpsPreferenceContext`** — persists the user's sharing toggle in `expo-secure-store` (key: `gps_sharing_enabled`). Wrap screens that need the preference with `GpsPreferenceProvider`.
- Map rendering uses `@maplibre/maplibre-react-native`.
- `UserStore.isRescuer` gates whether GPS streaming is activated after user sync in `AuthProvider`.

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

## External CLI Orchestration

Claude Code acts as the orchestrator. Use these tools purposefully — never call them speculatively or in rapid succession.

### Tools

| Tool | Command | When to use |
|---|---|---|
| **Gemini CLI** | `gemini -p "<task>"` | Repo scanning, file discovery, summarization, context gathering before reasoning |
| **Codex CLI** | `codex exec "<task>"` | Writing code, implementing fixes, generating tests, applying changes |
| **GitHub Copilot CLI** | `gh copilot suggest -t git "<task>"` | Analyzing staged changes and generating commit messages |

### Rules

1. **Analysis first** — when codebase understanding is needed before acting, run `gemini -p "<task>"` and read its output fully before proceeding.
2. **Implementation via Codex** — when writing or modifying code, delegate to `codex "<task>"` rather than editing directly, unless the change is trivial (single-line fix, renaming, etc.).
3. **Default workflow order:** Gemini (gather context) → Claude reasoning → Codex (implement) → Claude review.
4. **Minimal calls** — do not call Gemini or Codex if the answer is already in context. One well-scoped call beats two redundant ones.
5. **Always read output** — never fire a CLI tool and skip its output. Synthesize the result before continuing.
6. **Claude reviews last** — after Codex applies changes, run `npx tsc --noEmit` and review the diff before reporting done.

### Commit Message Workflow

When preparing a commit, use Copilot to analyze the diff and suggest a message:

```bash
# Stage changes first, then generate a commit message
git diff --staged | gh copilot suggest -t git "write a conventional commit message for these changes"
```

- Use the Copilot-suggested message as the baseline; refine it if needed before committing.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) format: `type(scope): description`.
- Valid types: `feat`, `fix`, `chore`, `patch`, `refactor`, `test`, `docs`.

---

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