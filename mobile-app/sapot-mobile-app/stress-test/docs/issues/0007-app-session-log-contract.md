# 0007 — App emits session-log contract (mobile-app side)

Labels: `ready-for-agent`
PRD: PRD-establishment-ceiling.md · ADR-0005, ADR-0002
Depends on: none (pairs with 0006, which parses these lines)
Note: touches `mobile-app/sapot-mobile-app` app code, not the stress-test package.

## Context

For failure attribution (0006) the phone must report what it did with each incoming session.
Per ADR-0005 the app logs session lifecycle events, gated to non-production builds exactly
like the userId beacon in ADR-0002.

## Scope

- Emit log lines on the phone for: session **accepted**, session **rejected**, and the
  current **active-session count**, at the point the signaling/connection layer decides.
- Gate the lines to `APP_VARIANT` ∈ {development, preview}; stripped in production. Reuse the
  runtime variant read established for ADR-0002 (`expoConfig.extra`).
- Use a stable, greppable format (fixed tag/prefix) so the stress-test parser (0006) has a
  reliable contract. Document the format in the stress-test README / ADR-0005.

## Acceptance criteria

- Development and preview builds emit accept/reject/active-count lines; production does not.
- The line format is stable and documented as a contract (ADR-0002/0005).
- No user-identifying payload beyond what ADR-0002 already permits in internal builds.

## Test plan

- App-side unit test (where the connection/signaling decision lives) asserting the lines are
  emitted on accept/reject and that the active count is included, and that they are gated by
  variant.
- Contract check: a captured sample line is parsed successfully by `parseSessionEvents` (0006).

## Out of scope

- The stress-test parser and attribution wiring (0006).
- Changing production logging behavior.
