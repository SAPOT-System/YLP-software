# 0003 — Loopback control baseline + laptop headroom

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0003
Depends on: 0002 (lag verdict), 0005 (ceiling rule, to compute the loopback ceiling)

## Context

The lag guard catches in-situ contamination, but we also want a positive baseline: how many
sessions can THIS laptop establish in the easy case? A one-time loopback control run at the
same peer counts gives that. Because loopback PCs are far cheaper than star PCs, the loopback
peers must do the same DTLS + media work or the baseline is optimistic (ADR-0003).

## Scope

- Add an optional one-time loopback control run (reuse the retained loopback smoke mode) at
  the configured peer-count ramp, producing a loopback "establishment ceiling" via the same
  `determineCeiling` rule.
- Make loopback control peers add the same DTLS + media tracks (audio-video) as star peers.
- Add pure `assessLaptopHeadroom(loopbackCeiling, phoneCeiling)` → a verdict
  (e.g. headroom-ok / borderline / insufficient) using a configurable margin.
- Surface the headroom verdict in the report.

## Acceptance criteria

- A star report can include a laptop-headroom verdict derived from a loopback baseline.
- Loopback control peers are load-comparable to star peers (same tracks/codecs).
- `assessLaptopHeadroom` is pure and unit-tested.
- The lag guard (0002) remains authoritative when it and headroom disagree.

## Test plan

- Unit-test `assessLaptopHeadroom`: loopback >> phone → ok; loopback ≈ phone → borderline/
  insufficient; configurable margin honored.
- Verify (with injected fakes) the loopback control run reuses the ceiling rule.

## Out of scope

- Multi-host baselines (rejected, ADR-0001).

## Done (2026-06-18)

- `assessLaptopHeadroom(loopback, phone, { okMarginFactor?, borderlineMarginFactor? })` added in
  `src/metrics/laptop-headroom.ts`. Pure function, returns `HeadroomResult { verdict, loopbackCeiling, phoneCeiling }`.
  Verdicts: headroom-ok (≥2×), borderline (≥1.5×), insufficient (<1.5×), undetermined (missing data).
- 13 unit tests in `tests/metrics/laptop-headroom.test.ts`.
- `formatHeadroomSummary(result)` added to `src/metrics/reporter.ts`; 4 reporter tests added.
- `LoopbackControlConfig { phases, startPort? }` added to `TestConfig` in `test-config.ts`.
- `orchestrator.runLoopbackControl(phases)` runs tcp-signaled pair-mode phases with the same webrtc
  config (DTLS + media tracks) as the main run — making loopback peers load-comparable to star peers.
- `runner.ts` runs loopback control before the main run when `config.loopbackControl` is set,
  then computes and prints the headroom verdict after the ceiling summary.
- 242/244 tests pass; 2 failures are the pre-existing ws-signaled negotiation flake (obs-2).
