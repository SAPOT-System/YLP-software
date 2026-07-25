# Design SAPOT as LAN-first, not internet-first-with-offline-fallback

**Status:** Accepted

## Context

SAPOT's core use case is disaster response, where internet connectivity at the incident site is often unavailable or unreliable, but a local network can be stood up quickly (a MikroTik router creating an ad-hoc Wi-Fi network). The architecture had to pick a primary assumption: build for the cloud/internet case and treat offline as a degraded fallback mode, or build for the LAN case and treat internet connectivity as an optional enhancement.

## Decision

SAPOT is LAN-first: messaging, peer discovery, and calls all function entirely on the LAN with no internet dependency (see [system-overview.md](../architecture/system-overview.md#design-principles)). The server is a LAN-resident coordination point (auth, sync, signalling relay), not a cloud service the app depends on for core function. Internet connectivity, if present, is used only for optional conveniences (e.g. a future upstream sync) — never required.

## Consequences

- **mDNS/Zeroconf peer discovery** and **direct LAN TCP+TLS / WebRTC P2P** become first-class transports rather than fallbacks, because the common case has no reachable cloud service at all — see [ADR 0004](0004-p2p-calls-with-signalling-relay.md) for how this shapes the calling architecture.
- **The server is deployed alongside the router at the incident site**, not in a data center. This simplifies the trust model (see [threat-model.md](../architecture/threat-model.md)) but means the server has no assumption of being always-on or professionally operated — see [runbooks.md](../deployment/runbooks.md) for the resulting disaster-recovery procedures.
- **No dependency on cloud infrastructure for the golden path** means no CDN, no managed database, no managed TURN/STUN beyond what's bundled — every piece of infrastructure SAPOT needs must be self-hostable on commodity hardware carried to the site.
- **Constraint accepted:** cross-site communication (rescuer at site A messaging someone at site B) is out of scope for the core design — SAPOT assumes all active participants share one LAN. The GSM/SMS fallback (see [sms-gateway feature](../features/sms-gateway/design.md)) is the only bridge to participants who are off the LAN entirely.
