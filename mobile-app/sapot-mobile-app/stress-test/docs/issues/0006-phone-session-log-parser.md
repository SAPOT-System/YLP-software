# 0006 — Phone session-log parser + failure attribution (stress-test side)

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0005, ADR-0002
Depends on: 0007 (the app must emit the lines this parses) — parser can be built first against fixtures

## Context

A laptop-side ICE timeout is ambiguous: phone-refused, never-arrived, or laptop failed to
emit. To attribute failures to the phone, parse the phone's session log lines (emitted by
0007) and classify each failure.

## Scope

- Add pure `parseSessionEvents(logText)` → typed `SessionEvent[]` (accepted / rejected /
  active-count), sibling of `logcat-parser.ts`. Tolerant of malformed/interleaved lines.
- Wire into the orchestrator (alongside the existing logcat path, ADR-0002) to classify each
  establishment failure as phone-refused vs never-arrived.
- Surface the failure classification per phase in the report (story 19).

## Acceptance criteria

- `parseSessionEvents` is pure and unit-tested with fixtures mirroring `logcat-parser.test.ts`.
- The report distinguishes phone-refused from never-arrived failures.
- Missing/silent log lines degrade gracefully (no crash; report notes attribution
  unavailable).

## Test plan

- Unit-test `parseSessionEvents`: well-formed accept/reject/active-count lines; malformed
  lines ignored; empty input → empty; interleaved with unrelated logcat noise.

## Out of scope

- Phone resource attestation via dumpsys (ADR-0005 future complement).
