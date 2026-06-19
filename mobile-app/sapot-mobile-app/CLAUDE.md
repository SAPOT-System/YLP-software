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
- `docs/LAN_MESSENGER.md` — LAN-only messaging behavior and constraints
- `docs/diagrams/` — sequence/architecture diagrams

---

## Decision Rules (precedence: top wins)

1. A direct user instruction in the current task overrides any rule below.
2. **One pattern per problem.** When two code patterns exist for the same concern,
   prefer the one used in `features/shared/` and the most recently merged on `main`.
   If still ambiguous, STOP and ask — never introduce a third pattern.
3. **Reuse before creating.** Search (`Grep`/`Glob`) for an existing service,
   adapter, hook, or util before writing a new one. Extend the existing one unless
   the user asked for a new module.
4. **Audit before refactoring.** Before changing shared code, find every caller and
   list them. Do not change a shared signature without accounting for all consumers.
5. **Server boundary.** `server/` is read-only reference. If a mobile change requires
   a backend change, STOP and surface it — do not edit `server/` unless the user
   explicitly approves a backend change.
6. **Scope discipline.** Make the change requested and nothing more. No drive-by
   refactors, renames, or dependency bumps unless asked.

---

## Definition of Done (all required before reporting complete)

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes for affected areas (`npm run testAll` for cross-cutting changes).
- [ ] `npm run lint` is clean.
- [ ] The relevant `docs/` file is updated per the doc-sync list above.
- [ ] No new file exceeds 800 lines; no new function exceeds ~50 lines.
- [ ] If tests, typecheck, or lint did not pass, say so explicitly — do not report done.

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

# Full check: tests + typecheck + lint + expo-doctor
npm run testAll

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

Features: `announcements`, `auth`, `call`, `chat`, `getting-started`, `gps`, `settings`, `shared`, `sync`

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
- **`ActiveUsersService`** — tracks which peers are currently online via the WS signaling adapter and notifies listeners of presence changes.

### Encryption / Key Management (`features/shared/services/`)

The app does end-to-end encryption (NaCl box / `tweetnacl`) over both transports plus encryption at rest:

- **`tcp-encryption.ts`** — wraps/unwraps `EncryptedEnvelope` messages over the direct TCP channel.
- **`ws-encryption.ts`** — encrypts signaling/credential payloads relayed through the server WebSocket so the relay cannot read them.
- **`local-encryption-service.ts`** — at-rest encryption of local data; owns the master key and signaling secret key (persisted via secure storage helpers in `key-derivation.ts`).
- **`peer-key-service.ts` / `peer-key-store.ts`** — fetches, signs, verifies, and caches peer public keys (`SignedCredential`).
- **`key-recovery-service.ts`** — wraps the master key under multiple recovery methods (`password`, `phone`, `email`, `qa`, `token`) producing a `WrappedBlob`.
- **`key-derivation.ts`** — KDF + secure-store accessors for master/signaling keys.

Crypto stack: `tweetnacl` + `tweetnacl-util`, `@noble/hashes`, `expo-crypto`, `react-native-quick-crypto`.

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

WatermelonDB with SQLite. Schema (`features/shared/database/schema.ts`, version 10) tables: `guest_user`, `peers`, `messages`, `calls`, `call_participants`, `message_receipts`, `conversations`, `conversation_participants`. Notable columns: `peers.role`, `peers.is_guest`, `messages.is_encrypted`. Migrations in `features/shared/database/migrations.ts`.

### Logging

Scope-based logger via `react-native-logs` + Reactotron (`features/shared/utils/logger.ts`). Each module uses a named scope (e.g., `connectionLog`, `networkLog`, `backgroundLog`). Control which scopes print at runtime via the env var:

```
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background
```

Leave unset to enable all scopes.

Logs are also written to a daily file (`sapot-{date-today}.log` in the app document directory) — always on in production, opt-in during development via `EXPO_PUBLIC_LOG_TO_FILE=1`. Use the exported `getLogFilePath()` / `clearLogFile()` helpers to retrieve or clear it.

In **development**, logs are additionally shipped to a laptop collector (`scripts/dev-log-server.mjs`, run via `npm run log-server`) which writes them to `dev-logs/dev-<metroPort>.log`, separated per dev-client (Metro) port. On by default in dev; disable with `EXPO_PUBLIC_LOG_TO_LAPTOP=0`. See `docs/ENV_CONFIG.md`.

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

## Git & Commits

- Never commit directly to `main` or `develop` — create a branch first.
- Commit only when the user asks. Do not push unless asked.
- Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`.
  Valid types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `ci`.
- Analyze the full diff (`git diff <base>...HEAD`), not just the latest commit, before writing a PR summary.

---

## Conventions
- Screens in `app/` using Expo Router file-based routing.
- Use `useTheme()` for dark mode — never hardcode colors.
- **Permission states:** every flow touching camera/mic/location/notifications must render distinct UI for `not-asked`, `denied`, and `granted`. Never assume `granted`.
- **Offline:** every network call must catch failure and surface a user-visible state. Never leave an indefinite spinner or swallow the error silently.
- Safe-area insets on all screens.
- Run `npx tsc --noEmit` after any TypeScript change before reporting the result as done.
- When fixing bugs, provide the fix directly and concisely. Avoid lengthy investigation narratives before showing the solution.
- **TypeScript types:** prefer precise types. `any` is banned except in test mocks with an inline `// eslint-disable` justification. `unknown` is correct at trust boundaries (catch clauses, JSON/`fetch` parsing, external API responses) — narrow it before use; do not use it to avoid typing a value whose shape is known.


## Don'ts
- Don't eject from Expo managed workflow
- Don't use AsyncStorage for sensitive data (use expo-secure-store)
- Don't hardcode dimensions — use flex layouts