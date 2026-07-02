# CLAUDE.md — mobile-app/sapot-mobile-app

Instructions for Claude Code working in the SAPOT mobile app. See root `../../CLAUDE.md` for repo-wide rules; this file is project-specific. Repo-wide git/commit conventions live in root `CLAUDE.md` / `CONTRIBUTING.md` — not repeated here.

## Project Overview

React Native / Expo (Expo Router) Android app — the primary client of the SAPOT platform. Provides LAN-first messaging (P2P + WebSocket relay fallback), voice/video calls (WebRTC), live GPS sharing, announcements, and offline-first local storage, so the app keeps working when internet/server connectivity is unavailable.

Stack: Expo, React Native, TypeScript, WatermelonDB (SQLite), WebRTC, `react-native-tcp-socket`, `tweetnacl` (E2E crypto), `expo-background-task`.

Use the `app-commands` skill for the full CLI reference beyond the quality-gate commands listed in "When Modifying This Project" below.

## Architecture

### Dependency Injection

Manual DI via two container classes, not a framework:
- **`AuthContainer`** (`features/auth/auth-container.ts`) — owns auth state: `sessionStore`, `userStore`, `peerService`, `peerRepository`, `userService`.
- **`MainContainer`** (`features/shared/main-container.ts`) — constructed with an `AuthContainer`; the single point of initialization for the app, wiring every runtime service/repository. Passed down via React context (`features/shared/context/main-container-context.tsx`). Services are instantiated once, not singletons.

**Construction order matters:** `ConnectionService` is constructed last because it wires sub-services in its constructor via callbacks (`.setTcpCallbacks()`, `.setSignalingSender()`). Callbacks use closures instead of `.bind()` so `jest.spyOn` replacements on the instance are respected in tests — don't "simplify" this to `.bind()`.

### Connection layer (`features/shared/connection/services/`)

- **`ConnectionService`** — central P2P facade; manages `TcpClientAdapter` per peer, orchestrates `WebrtcSessionManager`, `SignalingService`, `CallMediaService`. Extends `TypedEventEmitter<ConnectionServiceEvents>`. Three transport modes, selected via `AppModeStore`: `auto` (WS first, TCP fallback), `server` (WS only), `lan` (TCP only).
- **`WebrtcSessionManager`** — one `WebrtcAdapter` (RTCPeerConnection) per peer; forwards `remoteStream`/`peer-reconnected`/`camera-on` etc. up to `ConnectionService`.
- **`SignalingService`** — routes WebRTC SDP/ICE via TCP (direct) or WS (relay), enforcing the active transport mode.
- **`CallMediaService`** — local mic/camera stream lifecycle.
- **`DiscoveryService`** — mDNS (Zeroconf) peer discovery on the LAN.
- **`ChatService`** — message send/receive, persisted to WatermelonDB via data channels.
- **`CallService`** — call lifecycle, audio routing (earpiece/speaker/Bluetooth) via `react-native-incall-manager`.
- **`SyncService`** — periodic sync against the server REST API.
- **`CleanUpService`** — purges stale peers/messages/conversations; wired into `UserService` so cleanup runs on logout.
- **`ActiveUsersService`** — tracks peer presence via the WS signaling adapter.

### Adapters (`features/shared/connection/adapters/`)

Thin injectable wrappers around native modules, for testability: `TcpServerAdapter`/`TcpClientAdapter` (`react-native-tcp-socket`), `WsSignalingAdapter` (WebSocket + auto-reconnect/heartbeat, relay via server), `ZeroconfAdapter` (`react-native-zeroconf`), `WebrtcAdapter` (`react-native-webrtc`).

### Background connectivity

`expo-background-task` + `expo-task-manager` (`task/signaling-task.ts`). Two coordination mechanisms:
1. **App-alive flag** — `setAppAlive(true)` in `MainContainer.initialize()` tells the background task to stand down; `setAppAlive(false)` on cleanup lets it resume.
2. **Secure storage handoff** — `features/shared/core/stores/secure-config.ts` persists `peerId`, `wsUrl`, TCP host/port, local IP via `expo-secure-store`. `NetworkConfig` writes the updated IP immediately on WiFi change so the background task reads current config on wake.

The task wakes every 15 minutes (Android minimum) using stored config to maintain connectivity when the app is killed.

## Directory Guide

```
features/<name>/
  services/       # Business logic
  repositories/   # WatermelonDB data access
  hooks/          # React hooks consuming services/stores
  components/     # UI components
  types.ts
  index.ts        # Public API
```
Features: `announcements`, `auth`, `call`, `chat`, `getting-started`, `gps`, `settings`, `shared`, `sync`.

- `app/` — Expo Router file-based routing (screens).
- `features/shared/` — cross-feature services, DI containers, connection/crypto/database infrastructure. Check here first before writing a new util/service.
- `docs/` — project-specific architecture docs (see Development Conventions — keep in sync).
- `test/` — test utilities (builders, factories, mocks); `jest-setup.js` has global mocks for WatermelonDB, TCP sockets, WebRTC, Zeroconf, Expo modules, react-native-paper.
- `task/` — background task registration (`signaling-task.ts`).

## Key Concepts

- **Transport modes** (`auto`/`server`/`lan`, `AppModeStore`) — determine whether P2P (TCP), server-relayed (WS), or both are used for signaling/chat. Most connection bugs trace back to which mode was active.
- **Encryption / key management** (`features/shared/crypto/`) — NaCl box (`tweetnacl`) E2E encryption over both TCP and WS transports, plus at-rest encryption. Key files: `tcp-encryption.ts`, `ws-encryption.ts`, `local-encryption-service.ts`, `peer-key-service.ts`, `key-derivation.ts`, `key-recovery-service.ts`. Use the `crypto-architecture` skill for the full file map and decision rules — don't re-derive this from scratch.
- **GPS** (`features/gps/`) — live location sharing via a dedicated WebSocket (`/gps/ws/<userId>`), independent of `ConnectionService`. Key hooks: `useGpsStreaming`, `useLatestLocations`. Gated by `UserStore.isRescuer`. Use the `gps-architecture` skill for hook details.
- **Local database** — WatermelonDB/SQLite. Schema (`features/shared/database/schema.ts`, version 10): `guest_user`, `peers`, `messages`, `calls`, `call_participants`, `message_receipts`, `conversations`, `conversation_participants`. Notable columns: `peers.role`, `peers.is_guest`, `messages.is_encrypted`. Migrations in `features/shared/database/migrations.ts`.
- **Environment/config** — `config/runtime.ts` resolves API/WS base URLs: `__DEV__` → `http://<DEV_HOST>:8000` (update `DEV_HOST` for local dev); EAS channels `preview`/`production` → `https://sapot.online`.
- **Logging** — scope-based logger (`features/shared/core/utils/logger.ts`); enable scopes via `EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,...` (unset = all). Daily log file via `getLogFilePath()`. Use the `dev-logging` skill for log retrieval.

## Development Conventions

**Decision rules (precedence: top wins):**
1. A direct user instruction in the current task overrides any rule below.
2. **One pattern per problem.** When two code patterns exist for the same concern, prefer the one used in `features/shared/` and the most recently merged on `main`. If still ambiguous, STOP and ask — never introduce a third pattern.
3. **Reuse before creating.** Search (`Grep`/`Glob`) for an existing service, adapter, hook, or util before writing a new one. Extend the existing one unless the user asked for a new module.
4. **Audit before refactoring.** Before changing shared code, find every caller and list them. Do not change a shared signature without accounting for all consumers.
5. **Cross-component changes.** If a mobile change requires a backend change, treat it as a two-component change: implement both together (see `../../server/CLAUDE.md` for backend-specific rules) and call out the cross-component impact in your summary — don't silently leave the backend half undone.
6. **Scope discipline.** Make the change requested and nothing more. No drive-by refactors, renames, or dependency bumps unless asked.

**Large changes:** for any change touching shared code or spanning more than one feature — list every affected file and caller, provide a written plan, wait for explicit user approval, then implement and verify. Never begin implementation before approval.

**Keep documentation in sync.** When adding/updating features, APIs, messages, DB tables, or services, update the relevant `docs/` file:
- `docs/ARCHITECTURE.md` — new services, adapters, stores, DI wiring, transport changes
- `docs/CALL_FLOW.md` — new call message types or lifecycle changes
- `docs/API.md` — new/changed REST endpoints
- `docs/DATABASE.md` — schema changes (tables, columns, enums)
- `docs/SYNC.md` — sync strategy, triggers, `lastPulledAt` tracking
- `docs/ENV_CONFIG.md` — new env vars, build variants, secure-storage keys
- `docs/TESTING.md` — new test utilities, mock patterns, testing conventions
- `docs/CONNECTION_MESSAGES.md` — new WebSocket/TCP/WebRTC data-channel messages
- `docs/LAN_MESSENGER.md` — LAN-only messaging behavior/constraints
- `docs/diagrams/` — sequence/architecture diagrams

Before writing any new file, read `docs/ARCHITECTURE.md` (service/adapter landscape, DI wiring), `docs/design-system.md` (component patterns, theming, spacing), `docs/conventions.md` (naming, error handling, coding style), `docs/system-boundaries.md` (service/feature boundary rules). If any of those conflict with this file, this file wins.

**Screens:** `app/` using Expo Router file-based routing. **Theming:** use `useTheme()` — never hardcode colors. **Permission states:** every flow touching camera/mic/location/notifications must render distinct UI for `not-asked`, `denied`, `granted` — never assume `granted`. **Offline:** every network call must catch failure and surface a user-visible state — never leave an indefinite spinner or swallow the error silently. **Safe-area insets** on all screens. **TypeScript:** prefer precise types; `any` is banned except in test mocks with an inline `// eslint-disable` justification; `unknown` is correct at trust boundaries (catch clauses, JSON/`fetch` parsing, external responses) — narrow before use, don't use it to dodge typing a known shape.

## Important Files

- `features/shared/main-container.ts` — single initialization point for the app; read before touching service wiring.
- `features/auth/auth-container.ts` — auth state container, constructed before `MainContainer`.
- `features/shared/connection/services/ConnectionService.ts` — central P2P/transport facade.
- `features/shared/database/schema.ts` — WatermelonDB schema (version 10) and column reference.
- `features/shared/database/migrations.ts` — schema migration history.
- `config/runtime.ts` — API/WS base URL resolution per build variant.
- `task/signaling-task.ts` — background connectivity task.

## Common Pitfalls

- Changing `ConnectionService`'s callback wiring to `.bind()` instead of closures — breaks `jest.spyOn` instance replacement in tests.
- Editing a shared service/hook without auditing all `features/<name>/` consumers first (see Decision Rule 4) — this codebase has many features sharing `features/shared/`.
- Introducing a second pattern for something `features/shared/` already solves (a second HTTP client, a second logger, a second encryption helper) instead of extending the existing one.
- Forgetting the background task depends on `secure-config.ts` being written *before* the app is backgrounded — stale secure storage means the background task reconnects to an old IP/peerId.
- Assuming `server/` changes propagate automatically — the mobile app has its own API client; a backend contract change must be applied here too (see Decision Rule 5).

## When Modifying This Project

- Touching `features/shared/connection/` or `features/shared/crypto/`: these are the highest-blast-radius directories — audit all consumers, and prefer the `crypto-architecture` skill's file map over re-deriving the crypto flow from scratch.
- Touching the WatermelonDB schema (`features/shared/database/schema.ts`): add a migration in `migrations.ts`, and update `docs/DATABASE.md` and the root-level `../../docs/database/tables.md` (server + mobile schema overview) together.
- Touching call/connection message types: update `docs/CONNECTION_MESSAGES.md` and `docs/CALL_FLOW.md` — other clients/tests parse these message shapes.
- Run `npm run typecheck`, `npm test` for affected areas (`npm run testAll` for cross-cutting changes), and `npm run lint` before reporting a change complete; if any did not pass, say so explicitly rather than reporting done.
