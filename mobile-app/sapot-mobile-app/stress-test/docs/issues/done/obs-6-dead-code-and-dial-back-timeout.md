# fix(stress-test): remove wsPeakQueueFills dead code; align TCP dial-back timeout with connectionTimeoutMs

## Parent

[PRD — Datachannel observability, media timeline, and message count control](../superpowers/plans/2026-06-15-observability-and-message-control.md)

## What to build

Two small fixes bundled together — both are removals/alignments with no new behaviour.

### 1 — Remove `wsPeakQueueFills` dead code

`wsPeakQueueFills` is declared in `PeerMetrics`, initialised in `emptyMetrics()`,
tracked in `MetricsCollector`, and included in `PhaseStats`, but it is never written
to by any peer class. Remove it from all locations:

- `base-peer.ts` — remove from `PeerMetrics` and `emptyMetrics()` (coordinate with
  obs-1 which rewrites this interface)
- `collector.ts` — remove `private wsPeakQueueFills`, `recordQueueFill()`, the
  `wsPeakQueueFills` field from `PhaseStats`, and its line in `computeStats()` and
  `reset()`
- Any reporter output line referencing `wsPeakQueueFills`

### 2 — Align TCP star dial-back timeout with `connectionTimeoutMs`

In `TcpSignaledWrtcPeer.connectTo`, the race between the server handshake promise
and a timeout uses a hardcoded expression:

```typescript
const waitMs = Math.min(3000, (this.config.connectionTimeoutMs ?? 15_000) / 5);
```

Replace with:

```typescript
const waitMs = this.config.connectionTimeoutMs ?? 15_000;
```

The outer `timer` set at the top of `connectTo` already caps the total connection
budget, so the inner wait can safely use the full configured timeout.

## Acceptance criteria

- [ ] `PeerMetrics` has no `wsPeakQueueFills` field
- [ ] `emptyMetrics()` does not initialise `wsPeakQueueFills`
- [ ] `MetricsCollector` has no `wsPeakQueueFills` field, no `recordQueueFill`,
      and no reference in `computeStats()` or `reset()`
- [ ] `PhaseStats` has no `wsPeakQueueFills` field
- [ ] No reporter function references `wsPeakQueueFills`
- [ ] The dial-back race in `TcpSignaledWrtcPeer.connectTo` uses
      `this.config.connectionTimeoutMs ?? 15_000` directly (no `Math.min` with 3000)
- [ ] `npm run build` and `npm test` pass

## Blocked by

obs-1 coordinates on the `PeerMetrics` rewrite — these two issues must not be
applied to `base-peer.ts` independently without merging the changes first.
