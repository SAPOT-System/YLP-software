# Developer Onboarding

Welcome to SAPOT. This document orients you to where complexity lives and how to navigate the codebase.

---

## Codebase Weight Map

Not all features are equal in size. Here's where the lines of code actually live:

| Feature | Lines | Files | Role |
|---|---|---|---|
| `features/shared/` | ~22 k | 166 | **Engine** — P2P runtime, encryption, DI, database |
| `features/chat/` | ~7.5 k | 45 | Message threads, sync, key management |
| `features/auth/` | ~6.2 k | 68 | Registration, login, guest flow |
| `features/call/` | ~4.1 k | 35 | Audio/video call UI and lifecycle |
| `features/sync/` | ~3.2 k | 16 | Background data sync with server |
| `features/gps/` | ~0.7 k | 10 | Live location sharing (rescuers only) |
| `features/settings/` | ~0.6 k | 5 | User preferences |
| `features/announcements/` | ~0.4 k | 9 | Server-fetched announcement board |
| `features/getting-started/` | ~0.4 k | 8 | Onboarding screens |

`features/shared/` is ~50 % of all production code. It holds the entire runtime engine.

---

## The Engine (`features/shared/`)

`shared/` is not a catch-all — it is a layered P2P runtime engine. Four sub-domains in dependency order (bottom → top):

| Sub-domain | Path | What lives here |
|---|---|---|
| **core** | `shared/core/` | Logger, errors, theme context, WatermelonDB schema/models, stores, API client |
| **crypto** | `shared/crypto/` | NaCl E2E encryption, key derivation, key recovery, at-rest encryption |
| **peer** | `shared/peer/` | `PeerService`, `PeerRepository`, `GuestUserRepository` |
| **connection** | `shared/connection/` | `ConnectionService`, WebRTC, signaling, TCP/WS adapters, discovery |

**Dependency rule:** a sub-domain may only import from itself and sub-domains *below* it. Domain features (`chat/`, `auth/`, etc.) depend on the engine — never the reverse. See `features/shared/README.md` for the one-page map.

---

## Reading Path for New Contributors

If you're new, read in this order:

1. **This file** — understand weight distribution and engine structure.
2. **`docs/ARCHITECTURE.md`** — DI containers, service landscape, adapters, data flow.
3. **`docs/conventions.md`** — naming, error handling, immutability rules.
4. **`features/shared/README.md`** — the four engine sub-domains and their dependency rule.
5. **`docs/CONNECTION_MESSAGES.md`** — WebSocket / TCP / WebRTC message contracts.
6. **`docs/CALL_FLOW.md`** — call lifecycle (only needed if touching call code).

---

## Four Hard Areas

These are the most complex parts of the codebase. Don't start here — come back after reading the architecture doc.

| Area | Entry point | Why it's complex |
|---|---|---|
| `ConnectionService` | `shared/connection/services/connection-service.ts` | Central P2P facade. Three transport modes, WebRTC orchestration, TCP per-peer state, typed event bus. ~900 lines. |
| `WebrtcAdapter` | `shared/connection/adapters/webrtc-adapter.ts` | RTCPeerConnection per peer, liveness probing, ICE restart backoff, local media controls. |
| `MainContainer` | `shared/main-container.ts` | Single DI wiring point. Construction order is load-bearing; phase-gated `initialize()` uses branded tokens. |
| Crypto stack | `shared/crypto/` | NaCl box encryption over TCP + WS, at-rest encryption, key derivation, recovery. See `crypto-architecture` skill. |

---

## Where Things Are

| Concern | Where to look |
|---|---|
| Service wiring / DI | `shared/main-container.ts`, `features/auth/auth-container.ts` |
| WebRTC peer connection | `shared/connection/adapters/webrtc-adapter.ts` |
| TCP direct transport | `shared/connection/adapters/tcp-client-adapter.ts` |
| WS relay transport | `shared/connection/adapters/ws-signaling-adapter.ts` |
| E2E encryption | `shared/crypto/tcp-encryption.ts`, `shared/crypto/ws-encryption.ts` |
| Database schema | `shared/core/database/schema.ts` |
| Stores (app state) | `shared/core/stores/` |
| API client | `shared/core/api/client.ts` |
| Screen routing | `app/` (Expo Router file-based routing) |
| Background connectivity | `task/signaling-task.ts` |
| GPS / location sharing | `features/gps/` (independent WS, not `ConnectionService`) |

---

## Related Docs

- `docs/ARCHITECTURE.md` — full service and adapter landscape
- `docs/DATABASE.md` — WatermelonDB schema and migrations
- `docs/SYNC.md` — sync strategy and `lastPulledAt` tracking
- `docs/ENV_CONFIG.md` — env vars and EAS build variants
- `docs/TESTING.md` — test utilities, mocks, conventions
- `features/shared/README.md` — engine sub-domain map
- `features/README.md` — feature weight table (quick reference)
