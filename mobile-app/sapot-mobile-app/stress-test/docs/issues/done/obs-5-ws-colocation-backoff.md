# fix(stress-test): exponential backoff for WS colocation retry loop

## Parent

[PRD — Datachannel observability, media timeline, and message count control](../superpowers/plans/2026-06-15-observability-and-message-control.md)

## What to build

Replace the fixed `sleep(500)` between WS colocation retry rounds with exponential
backoff capped at 5 000 ms. This makes early rounds fast (server usually re-routes
quickly) and gives later rounds breathing room when the server is under load.

**In `orchestrator.ts`**, inside the colocation loop, replace:

```typescript
await sleep(500);
```

with:

```typescript
const backoffMs = Math.min(500 * Math.pow(2, round), 5_000);
await sleep(backoffMs);
```

`round` is the existing loop variable. Round 0 waits 500 ms, round 1 waits 1 000 ms,
round 2 waits 2 000 ms, round 3 waits 4 000 ms, round 4+ waits 5 000 ms.

`MAX_COLOCATION_ROUNDS` (20) is unchanged.

## Acceptance criteria

- [ ] The sleep duration inside the colocation loop is `Math.min(500 * 2^round, 5000)` ms
- [ ] Round 0 delay is 500 ms, round 1 is 1 000 ms, round 3 is 4 000 ms, round 4+
      is 5 000 ms
- [ ] `MAX_COLOCATION_ROUNDS` remains 20
- [ ] `npm run build` passes

## Blocked by

None — single-line change, no interface dependency.
