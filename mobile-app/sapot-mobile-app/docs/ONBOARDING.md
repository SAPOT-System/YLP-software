# Developer Onboarding

Welcome to SAPOT. This document orients you to where complexity lives and how to navigate the codebase.

---

## Codebase Weight Map

Not all features are equal in size, and the difference is large enough to change how you should
read the codebase:

- **`features/shared/` is the engine** — roughly **45 %** of all production code on its own. It is
  not a utility bucket; it is the P2P runtime, encryption, DI and database layer.
- **`chat/` and `auth/` are the heavyweight domain features**, together about as large as
  everything else combined.
- **`call/`, `debug/` and `sync/` are mid-sized**; `gps/`, `settings/`, `announcements/` and
  `getting-started/` are small enough to read end-to-end in one sitting.

Exact line and file counts, plus the command to regenerate them, live in
[`ARCHITECTURE.md`](ARCHITECTURE.md#feature-structure) — that is the single canonical copy.

---

## The Engine (`features/shared/`)

`shared/` is not a catch-all — it is a layered P2P runtime engine. Four sub-domains in dependency order (bottom → top):

| Sub-domain | Path | What lives here |
|---|---|---|
| **core** | `shared/core/` | Logger, errors, theme context, WatermelonDB schema/models, stores, API client |
| **crypto** | `shared/crypto/` | NaCl E2E encryption, key derivation, key recovery, at-rest encryption |
| **peer** | `shared/peer/` | `PeerService`, `PeerRepository`, `GuestUserRepository` |
| **connection** | `shared/connection/` | `ConnectionService`, WebRTC, signaling, TCP/WS adapters, discovery |

**Dependency rule:** a sub-domain may only import from itself and sub-domains *below* it. This
holds strictly — `crypto/` and `peer/` do not import `connection/`.

Domain features (`chat/`, `auth/`, etc.) depend on the engine. The reverse direction is the weaker
rule and has known exceptions — `main-container.ts` must import every concrete type it wires, and
three lower-layer files still reach up into domain features. They are listed in
[`ARCHITECTURE.md`](ARCHITECTURE.md#engine-sub-domains-featuresshared); treat them as debt, not
precedent.

See `features/shared/README.md` for the one-page map.

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
| `ConnectionService` | `shared/connection/services/connection-service.ts` | Central P2P facade. Three transport modes, WebRTC orchestration, TCP per-peer state, typed event bus. **~1 450 lines** — the largest file in the codebase, and well over the 800-line guideline. |
| `WebrtcAdapter` | `shared/connection/adapters/webrtc-adapter.ts` | RTCPeerConnection per peer, plus local media controls. Liveness probing and ICE-restart backoff are already extracted to `LivenessMonitor` / `IceRestartController`. ~860 lines. |
| `MainContainer` | `shared/main-container.ts` | Single DI wiring point (~640 lines). Construction order is load-bearing; phase-gated `initialize()` uses branded tokens. |
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
| Android foreground connectivity | `features/shared/hooks/use-foreground-service.ts` |
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
