# 0002 — Event-loop lag guard (laptop gate, in-situ)

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0003
Depends on: none (consumed by 0003 and 0005)

## Context

The laptop drives all simulated peers through one Node event loop. If that loop saturates
before the phone does, the "ceiling" is the laptop's, not the phone's. We need an in-situ
signal of laptop overload that can invalidate a phase. Per ADR-0003 this signal is
authoritative.

## Scope

- Add `EventLoopLagSampler` adapter (sibling of `NetworkSampler`): start/stop/reset/getSamples,
  sampling event-loop delay during a phase. Side-effecting but thin; `unref()` its timer.
- Add pure `isPhaseLagValid(samples, thresholdMs)` → boolean (default threshold ~50 ms p95,
  configurable).
- Wire the sampler into each phase in the orchestrator; record the verdict on the phase.
- Surface the lag verdict in the report per phase (story 24).

## Acceptance criteria

- Each phase carries an event-loop-lag p95 and a pass/fail verdict.
- `isPhaseLagValid` is pure and unit-tested independent of the sampler.
- Threshold is configurable (not a hard-coded constant in the decision function).

## Test plan

- Unit-test `isPhaseLagValid` with crafted sample arrays: below threshold → valid; a p95
  spike above threshold → invalid; boundary equal to threshold (define inclusive/exclusive).
- Sampler adapter: light test that it collects samples over a short window (mirror the
  `NetworkSampler` testing approach).

## Out of scope

- Excluding invalid phases from the ceiling (that belongs to 0005, which consumes the verdict).
