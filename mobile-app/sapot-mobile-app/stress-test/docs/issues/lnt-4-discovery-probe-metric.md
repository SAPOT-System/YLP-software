# feat(stress-test): measure phone discovery via inbound liveness probe

## Parent

[PRD — Align tcp-signaled to a real local-network test](../superpowers/plans/2026-06-13-local-network-test-alignment-prd.md)
· ADR [0001](../adr/0001-canonical-local-network-test-star-vs-phone.md)

## What to build

The phone's discovery sweep opens a **bare TCP connection** (no NaCl handshake) to every
peer it has discovered. Use that as the laptop-observable proof of discovery.

- In the canonical peer's inbound-connection handling, distinguish a **discovery probe**
  (socket opens, no `handshake-init` arrives before close / within a short window) from a
  **real session dial** (socket opens and proceeds through the NaCl handshake).
- Record the first probe per peer with a timestamp.
- Add collector aggregation for two phase metrics:
  - **discovery completeness** — distinct peers that received a probe / N,
  - **discovery latency** — time from the peer's mDNS `advertise()` to its first probe.

## Acceptance criteria

- [ ] A bare-connect-then-close is recorded as a discovery probe, not a connection error
- [ ] A connection that completes the NaCl handshake is recorded as a session, not a probe
- [ ] Only the first probe per peer counts toward discovery latency
- [ ] Collector exposes discovery completeness and discovery latency for a phase
- [ ] Unit tests cover probe-vs-dial discrimination and metric aggregation with real sockets
      on 127.0.0.1 (prior art: existing tcp-signaled peer test)
- [ ] `npm run build` and `npm test` pass

## Blocked by

[lnt-3 — advertise canonical peer over mDNS](./lnt-3-peer-mdns-advertise.md) (a peer must be
advertising/listening to receive a probe and to anchor discovery latency).
