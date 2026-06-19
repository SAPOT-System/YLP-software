# 0011 — Relative link-health threshold

Labels: `ready-for-agent`
PRD: PRD-tcp-star-accuracy.md
Type: AFK
Depends on: none

## What to build

Replace the absolute 10 Mbps floor in `isLinkHealthy` with a relative degradation check
plus a low absolute safety floor. The function gains a second argument for the under-load
iperf result. Default thresholds: `maxDegradationFactor: 0.15`, `minThroughputMbps: 2`,
`maxLossPercent: 1`. DEGRADED when under-load drops >15% below baseline or falls below
2 Mbps. When under-load is absent, only the 2 Mbps floor and loss check apply. The runner
call site passes the first phase's `iperfLoad` as the second argument.

## Acceptance criteria

- [ ] Baseline 8 Mbps, under-load 8 Mbps → healthy (no false DEGRADED).
- [ ] Baseline 8 Mbps, under-load 6.7 Mbps (>15% drop) → DEGRADED with ratio reason.
- [ ] Under-load below 2 Mbps → DEGRADED regardless of ratio.
- [ ] Null under-load → 2 Mbps floor + loss check only, no ratio check.
- [ ] Null baseline → healthy pass-through.
- [ ] Unit tests covering all five cases; existing tests updated.
- [ ] `npm run build` passes.

## Blocked by

None — can start immediately.
