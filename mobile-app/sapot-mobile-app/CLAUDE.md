# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important

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

Before writing any new file, read these to ensure consistency with established patterns:
- `docs/architecture.md` — service and adapter landscape, DI wiring
- `docs/design-system.md` — component patterns, theming, spacing
- `docs/conventions.md` — naming, error handling, coding style
- `docs/system-boundaries.md` — service interface and feature boundary rules

If any conflict with CLAUDE.md, CLAUDE.md wins.

## Large Changes

For any change touching shared code or spanning more than one feature: list every affected file and caller, provide a written plan, wait for explicit user approval, then implement and verify. Never begin implementation before the user approves the plan.

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

Use the `app-commands` skill for the full CLI reference. Core quality checks: `npm run typecheck`, `npm test`, `npm run testAll`.

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

NaCl box (`tweetnacl`) E2E encryption over both TCP and WS transports, plus at-rest encryption. Key files: `tcp-encryption.ts`, `ws-encryption.ts`, `local-encryption-service.ts`, `peer-key-service.ts`, `key-derivation.ts`, `key-recovery-service.ts`. Crypto stack: `tweetnacl`, `@noble/hashes`, `expo-crypto`, `react-native-quick-crypto`. Use the `crypto-architecture` skill for the full file map and decision rules.

### Adapters (`features/shared/adapters/`)

Thin injectable wrappers around native modules for testability:

| Adapter | Wraps |
|---|---|
| `TcpServerAdapter` / `TcpClientAdapter` | `react-native-tcp-socket` |
| `WsSignalingAdapter` | WebSocket with auto-reconnect + heartbeat (signaling relay via server) |
| `ZeroconfAdapter` | `react-native-zeroconf` |
| `WebrtcAdapter` | `react-native-webrtc` |

### GPS Feature (`features/gps/`)

Live location sharing via a dedicated WebSocket (`/gps/ws/<userId>`) — independent of `ConnectionService`. Key hooks: `useGpsStreaming`, `useLatestLocations`. Map: `@maplibre/maplibre-react-native`. Gated by `UserStore.isRescuer`. Use the `gps-architecture` skill for hook details and data flow.

### Background Task Integration

The app supports Android background connectivity via `expo-background-task` + `expo-task-manager` (`task/signaling-task.ts`).

Two mechanisms coordinate foreground and background:

1. **App-alive flag** — `setAppAlive(true)` in `MainContainer.initialize()` tells the background task to stand down. On cleanup, `setAppAlive(false)` lets the task resume.
2. **Secure storage handoff** — `features/shared/stores/secure-config.ts` persists `peerId`, `wsUrl`, TCP host/port, and local IP via `expo-secure-store`. `NetworkConfig` writes updated IP immediately on WiFi change so the background task always reads the latest config on wake.

The background task wakes every 15 minutes (Android minimum) and uses the stored config to maintain connectivity when the app is killed.

### Local Database

WatermelonDB with SQLite. Schema (`features/shared/database/schema.ts`, version 10) tables: `guest_user`, `peers`, `messages`, `calls`, `call_participants`, `message_receipts`, `conversations`, `conversation_participants`. Notable columns: `peers.role`, `peers.is_guest`, `messages.is_encrypted`. Migrations in `features/shared/database/migrations.ts`.

### Logging

Scope-based logger (`features/shared/utils/logger.ts`). Enable specific scopes via `EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,...` (unset = all). Daily log file — retrieve via `getLogFilePath()`. Use the `dev-logging` skill for log file access and the dev laptop collector.

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
- Analyze the full diff (`git diff <base>...HEAD`), not just the latest commit, before writing a PR summary.

---

## Conventions
- Screens in `app/` using Expo Router file-based routing.
- Use `useTheme()` for dark mode — never hardcode colors.
- **Permission states:** every flow touching camera/mic/location/notifications must render distinct UI for `not-asked`, `denied`, and `granted`. Never assume `granted`.
- **Offline:** every network call must catch failure and surface a user-visible state. Never leave an indefinite spinner or swallow the error silently.
- Safe-area insets on all screens.
- Run `npm run typecheck` after any TypeScript change before reporting the result as done.
- When fixing bugs, provide the fix directly and concisely. Avoid lengthy investigation narratives before showing the solution.
- **TypeScript types:** prefer precise types. `any` is banned except in test mocks with an inline `// eslint-disable` justification. `unknown` is correct at trust boundaries (catch clauses, JSON/`fetch` parsing, external API responses) — narrow it before use; do not use it to avoid typing a value whose shape is known.


## Don'ts
- Don't eject from Expo managed workflow
- Don't use AsyncStorage for sensitive data (use expo-secure-store)
- Don't hardcode dimensions — use flex layouts
