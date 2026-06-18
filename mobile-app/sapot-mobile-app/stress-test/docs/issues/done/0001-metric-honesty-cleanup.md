# 0001 — Metric honesty cleanup

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0004
Depends on: none (do first; later issues build on the renamed fields)

## Context

The report shows numbers that don't mean what they say. The send-queue failure counter is
called "dropped" (implies network loss), `packetLossPercent` is derived from host TCP
retransmits that never carry WebRTC traffic, the RTP-loss metric is also send-queue
failures, and the latency stddev is labelled "jitter." Make every surviving metric honest.

## Scope

- Rename `PeerMetrics.dropped` → `txQueueOverflow` (and `recordDropped`/`droppedCount`
  accordingly) — it is local backpressure, not loss.
- Delete the tcpRetrans-derived `packetLossPercent` from `NetworkStats`, `PhaseStats`, and
  the report table.
- Remove `rtpPacketsLost` from reported output (media becomes load-only; sent count may stay
  as a load indicator).
- Relabel the latency stddev as "RTT stddev" in the report (not "jitter").

## Acceptance criteria

- No output column or JSON field named `packetLossPercent` or `jitter` (for the RTT stddev).
- `txQueueOverflow` is populated where `dropped` used to be; no remaining references to
  `dropped` as a network-loss concept.
- RTP loss is absent from the WebRTC report block.
- `npm run build` passes; existing suites updated to the new names.

## Test plan

- Update `tests/metrics/collector.test.ts` and `tests/metrics/reporter.test.ts`: assert the
  removed fields are gone and `txQueueOverflow` accumulates send-queue failures.
- Behavior-level assertions only (data in → reported shape out), per prior art.

## Out of scope

- Adding the new gates/ceiling (later issues). This issue is rename + delete only.
