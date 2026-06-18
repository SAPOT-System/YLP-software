# 0005 — Session-ceiling rule (success-rate cut-line)

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0004
Depends on: 0002 (lag verdict on each phase)

## Context

The tool must convert a peer-count ramp into one reproducible ceiling number. Per ADR-0004
the ceiling is the highest peer count where ICE-connected success rate ≥ 95% on a phase that
passed the lag gate. ICE-establish p95 and timeout rate are secondary early-warning only.

## Scope

- Add pure `determineCeiling(phases, { successThreshold = 0.95 })` → ceiling peer count.
  - Consider only lag-valid phases (0002 verdict).
  - Ceiling = highest peer count with success ≥ threshold; the first lag-valid phase below
    threshold is "over the ceiling."
  - Define behavior for "never degrades within range" (ceiling = max tested, note open-ended)
    and "degrades immediately" (ceiling below smallest tested).
- Report the single ceiling number plus secondary signals (ICE-establish p95, timeout rate).

## Acceptance criteria

- `determineCeiling` is pure and unit-tested with crafted `PhaseStats[]`.
- Lag-invalid phases are excluded from the determination.
- The final report states one ceiling number and the secondary early-warning signals.

## Test plan

- Unit-test `determineCeiling`: monotonic degradation; a lag-invalid phase straddling the
  knee is ignored; never-degrades; degrades-immediately; threshold boundary (define ≥).
- Prior art: `tests/metrics/reporter.test.ts`.

## Out of scope

- Latency-knee / composite ceiling rules (rejected, ADR-0004).
