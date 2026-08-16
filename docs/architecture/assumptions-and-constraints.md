# Assumptions and Constraints

This document consolidates the operating assumptions and hard technical constraints that shape SAPOT's architecture. Each item already exists in an ADR, the threat model, or another architecture doc — this page exists so they can be read as one list instead of rediscovered piecemeal. Where a fuller rationale exists elsewhere, this page links to it rather than repeating it.

This is the canonical assumptions/constraints document. Do not duplicate its content elsewhere — link here instead.

---

## Deployment-environment assumptions

These describe the physical/operational context SAPOT is designed for. Violating them doesn't crash the app, but it invalidates the design tradeoffs made throughout the rest of this section.

| Assumption | Why it matters | Source |
|---|---|---|
| **No internet dependency for core function.** Messaging, peer discovery, calls, GPS sharing, and auth all work with zero upstream connectivity. | Everything else (LAN-first transports, no CDN, no managed DB) follows from this. | [ADR 0005](../adr/0005-lan-first-design.md) |
| **All active participants share one LAN.** Cross-site communication (site A ↔ site B) is out of scope for the core design. | GSM/SMS is the only bridge to participants off the LAN; there is no multi-site routing. | [ADR 0005](../adr/0005-lan-first-design.md) |
| **The deployment window is short** — hours to days per incident, not a continuously-running service. | Shifts priority toward availability/simplicity over defense-in-depth infrastructure (CAs, HSMs, SIEM, migration tooling). | [threat-model.md](threat-model.md#deployment-context-and-assumptions) |
| **Physical access at the incident site is loosely controlled.** Anyone in Wi-Fi range or who can reach the router/server hardware is a potential adversary. | Justifies E2E encryption as the primary content-confidentiality control rather than network perimeter security. | [threat-model.md](threat-model.md#deployment-context-and-assumptions) |
| **Users are not vetted.** `guest` role requires no registration. | Deliberate tradeoff: registration friction at a disaster scene is unacceptable, at the cost of not being able to identify or hold guests accountable. | [ADR 0006](../adr/0006-four-tier-roles-model.md) |
| **Infrastructure must be self-hostable on commodity hardware carried to the site.** No CDN, no managed database, no managed TURN/STUN. | Every dependency SAPOT adds must run on a laptop-class host with no cloud fallback. | [ADR 0005](../adr/0005-lan-first-design.md) |
| **The server has no assumption of being always-on or professionally operated.** It's deployed alongside the router at the incident site, not in a data center. | Shapes the disaster-recovery runbook (manual restart/restore procedures, not managed failover). | [ADR 0005](../adr/0005-lan-first-design.md), [runbooks.md](../deployment/runbooks.md) |

---

## Technical/architectural constraints

These are decisions that constrain what future work can assume without a corresponding design change.

| Constraint | Detail | Source |
|---|---|---|
| **Server schema is Alembic-managed.** Migrations in `server/app/alembic/versions/` are the source of truth; `alembic upgrade head` runs as a deploy step in `runserver.sh`, and the app no longer calls `create_all()` at startup. | A model change needs a matching migration or CI fails (`alembic check`). Databases created before Alembic need a one-time `alembic stamp`, not `upgrade`. | [ADR 0007](../adr/0007-alembic-for-server-migrations.md), [migrations.md](../database/migrations.md) |
| **No TURN/STUN server.** WebRTC calls rely on host/LAN ICE candidates only (`iceServers: []`). | Calls fail across NATs — viable only because the primary deployment is one flat LAN. Cross-network calling (e.g. rescuer on cellular data) is unimplemented. | [ADR 0004](../adr/0004-p2p-calls-with-signalling-relay.md) |
| **Flat four-role model** (`guest`/`user`/`rescuer`/`admin`), no per-permission system. | No way to grant a partial capability (e.g. "GPS visibility for one team") without promoting a user to `rescuer` outright. | [ADR 0006](../adr/0006-four-tier-roles-model.md) |
| **Server-side `PeerKey` signing (`SERVER_ED25519_SEED`) is optional, not enforced.** | Without it, a compromised or malicious server can substitute a public key and MITM new conversations. Recommended (not required) to make mandatory in production. | [threat-model.md](threat-model.md#e2e-encryption-design-risks) |
| **No LAN segmentation.** Rescuer, admin, and civilian/guest devices share one broadcast domain; there is no VLAN config automated or documented. | Any device on the LAN can attempt to reach any other device's listening socket (mitigated by E2E encryption for content, not by network isolation). | [threat-model.md](threat-model.md#known-risks-and-accepted-tradeoffs) |
| **Message content field capped at 255 characters server-side.** | Long messages fail server-side; client-side composer has no corresponding guard. | `server/app/models/` `Message.content`, mobile message composer |
| **Message list has no pagination** — always queries the oldest 100 rows. | Conversations beyond 100 messages silently exclude newer messages from view. | mobile message-list query |
| **mDNS/Zeroconf discovery is unauthenticated by design** (mDNS has no auth mechanism). | Any device on the LAN can announce or discover peer presence; authentication happens at a higher layer (E2E keys), not at discovery. | [threat-model.md](threat-model.md#attack-surfaces-in-scope) |
| **No remote-wipe or session/device-revocation UI for end users.** Only `POST /auth/logout` (JWT blacklist) and admin-initiated account suspension exist. | A stolen, already-unlocked device has an unbounded compromise window until an admin manually intervenes. | [threat-model.md](threat-model.md#device-theft) |

---

## Explicitly out of scope

Carried over from the threat model's attack-surface boundaries — listed here because they're assumptions the rest of the architecture depends on being handled *elsewhere*, not gaps to fix in this codebase:

- Physical security of the incident site (crowd control, guarding hardware) — organizational, not technical.
- RouterOS/MikroTik firmware vulnerabilities — treated as a trusted third-party dependency.
- Android OS-level compromise (rooted device, malicious app with device-owner privileges) — outside the app's sandbox.
- Supply-chain compromise of npm/PyPI dependencies — mitigated by normal dependency-review practice, not modeled here.

See [threat-model.md](threat-model.md#attack-surfaces-explicitly-out-of-scope) for the full rationale.

---

## Known accepted tradeoffs

Risks the project has consciously decided to carry rather than fix, reproduced from the threat model's tradeoff table (see that document for status updates):

- No LAN segmentation — requires router-level VLAN config not currently documented or automated.
- `testing` router reachable when `ENVIRONMENT=development` or `staging` is accepted for QA. Production uses conditional mounting, a route-level environment guard, shared-secret authentication on mutations, and regression coverage.
- No remote session/device revocation UI — open.
- Optional (not enforced) server-side `PeerKey` signing — open.

Full detail: [threat-model.md § Known risks and accepted tradeoffs](threat-model.md#known-risks-and-accepted-tradeoffs).

---

## Related documents

- [ADR index](../adr/) — the individual decisions this page summarizes
- [threat-model.md](threat-model.md) — security-focused assumptions, trust boundaries, attack surfaces
- [system-overview.md](system-overview.md) — design principles these assumptions support
- [runbooks.md](../deployment/runbooks.md) — operational procedures that follow from the "not professionally operated" assumption
