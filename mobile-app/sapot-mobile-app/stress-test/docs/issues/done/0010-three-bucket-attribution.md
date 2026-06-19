# 0010 — Three-bucket failure attribution

Labels: `ready-for-agent`
PRD: PRD-tcp-star-accuracy.md
Type: AFK
Depends on: none

## What to build

Extend `classifyFailures` to return three counters instead of two:

- `phoneRefused` = rejected events count (unchanged)
- `arrivedButStalled` = min(accepted events count, connectionTimeouts − phoneRefused)
- `neverArrived` = connectionTimeouts − phoneRefused − arrivedButStalled

Matching is count-based. Propagate `arrivedButStalled` through `PhaseStats`, the result
JSON, and the reporter attribution block.

## Acceptance criteria

- [ ] `classifyFailures` returns `{ phoneRefused, arrivedButStalled, neverArrived }`.
- [ ] `arrivedButStalled` in `PhaseStats`, result JSON, and reporter attribution block.
- [ ] Unit tests: zero timeouts; all phone-refused; accepted count exceeds timeouts (min
  clamp); accepted below timeouts (partial stall); no accepted events.
- [ ] `npm run build` passes; existing suites green.

## Blocked by

None — can start immediately.
