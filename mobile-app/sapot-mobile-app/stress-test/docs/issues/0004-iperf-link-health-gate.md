# 0004 — Demote iperf to a link-health gate

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0004
Depends on: 0001 (metric cleanup)

## Context

iperf measures link capacity/loss — the network-limit goal we rejected. But a pre-run iperf
baseline is still useful as a *link-health gate*: it confirms the AP/link is healthy so we
don't blame the phone for link congestion. Keep the baseline probe; drop iperf from the
headline ceiling metrics.

## Scope

- Keep the pre-run iperf baseline probe; add pure `isLinkHealthy(iperfBaseline, thresholds)`
  → flag (degraded link). Configurable thresholds.
- Flag the run in the report when the link baseline is degraded (story 10).
- Remove iperf throughput/loss from per-phase ceiling metrics and from the saturation
  analysis; keep at most a single pre-run link-health line.

## Acceptance criteria

- Report shows a link-health verdict from the baseline, not per-phase iperf throughput/loss
  columns.
- `isLinkHealthy` is pure and unit-tested.
- Saturation analysis no longer references iperf loss as a ceiling signal.

## Test plan

- Unit-test `isLinkHealthy`: healthy baseline → ok; high-loss / low-throughput baseline →
  degraded; threshold boundaries.
- Reporter test: per-phase iperf columns are gone; link-health line present.

## Out of scope

- Per-phase concurrent iperf as a measured output (removed). The under-load iperf stage is no
  longer a ceiling metric.
