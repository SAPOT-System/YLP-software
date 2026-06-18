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

## Done (2026-06-18)

- `parseSessionEvents` implemented in `src/discovery/session-log-parser.ts`. Handles
  single-line and multi-line react-native-logs formats; tolerates malformed payloads.
  The log format here IS the contract for issue 0007 to implement.
- `classifyFailures(events, connectionTimeouts)` added in the same file.
- `PhaseStats.phoneRefused / neverArrived: number | null` added to `collector.ts`;
  both default to `null` (unavailable). `formatWebrtcBlock` shows per-kind counts or
  "unavailable" when null.
- 20 new unit tests in `tests/discovery/session-log-parser.test.ts`.

## Done — orchestrator wiring (2026-06-18)

- `scrapeSessionLog(sinceMs, exec?)` added to `adb-runner.ts`. Formats `MM-DD HH:MM:SS.mmm`
  timestamp for `adb logcat -d -T`; returns `null` when adb is unavailable (graceful
  degradation). 5 new unit tests in `tests/discovery/adb-runner.test.ts`.
- Orchestrator injects `sessionLogScraper` (default = `scrapeSessionLog`). Per-phase:
  records `phaseStartMs = Date.now()` at phase start; after sending stops, calls
  `sessionLogScraper(phaseStartMs)` in star mode (null in pair mode); feeds result through
  `parseSessionEvents` → `classifyFailures` → sets `phoneRefused` / `neverArrived` on
  `PhaseStats`. Attribution shows "unavailable" in the report until 0007 makes the app
  emit the session log lines.
