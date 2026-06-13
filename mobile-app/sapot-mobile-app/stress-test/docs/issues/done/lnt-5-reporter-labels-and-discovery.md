# feat(stress-test): report discovery stats, representativeness banner, and honest mode labels

## Parent

[PRD — Align tcp-signaled to a real local-network test](../superpowers/plans/2026-06-13-local-network-test-alignment-prd.md)
· ADR [0001](../adr/0001-canonical-local-network-test-star-vs-phone.md)

## What to build

Make the report tell the truth about what each mode measured.

- **Discovery section:** surface discovery completeness and discovery latency (from
  [lnt-4](./lnt-4-discovery-probe-metric.md)) in the canonical local-network report.
- **Representativeness banner:** note that peer-side WebRTC runs on libdatachannel and is
  not phone-representative, while discovery and concurrent-session counts ARE phone-real.
- **Relabel `ws-signaled`** as a *server-signaling (FastAPI relay)* test in report headers
  (and README/config descriptions), removed from local-network framing.
- **Relabel loopback `tcp-signaled` pair** output as a *protocol/CPU smoke test*, not a
  local-network result.

## Acceptance criteria

- [ ] Canonical report includes a discovery section (completeness + latency)
- [ ] Report carries the representativeness banner distinguishing peer-side vs phone-real
      metrics
- [ ] `ws-signaled` report/header text describes a server-signaling test, not local network
- [ ] Loopback pair report/header text describes a protocol/CPU smoke test
- [ ] Reporter unit tests assert the new section and each label string (prior art: existing
      reporter tests)
- [ ] `npm run build` and `npm test` pass

## Blocked by

[lnt-4 — discovery probe metric](./lnt-4-discovery-probe-metric.md) (discovery section needs
the metrics). The relabelling parts have no blocker and may land first.
