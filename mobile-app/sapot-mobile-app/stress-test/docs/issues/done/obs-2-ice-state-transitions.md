# feat(stress-test): record ICE state transitions with elapsed times

## Parent

[PRD — Datachannel observability, media timeline, and message count control](../superpowers/plans/2026-06-15-observability-and-message-control.md)

## What to build

Update `onStateChange` in `createPc` across all three peer classes to push every
state transition (not just `'connected'` and `'failed'`) into
`metrics.iceStateTransitions` with its elapsed time relative to `connectStartMs`.

**In `createPc` in all three peer classes**, change `onStateChange`:

```typescript
pc.onStateChange((state: string) => {
  const elapsedMs = Date.now() - startMs;
  this.metrics.iceStateTransitions.push({ state, elapsedMs });
  this.metrics.connectedAtPhaseEnd = (state === 'connected');
  if (state === 'connected') onConnected(elapsedMs);
  else if (state === 'failed') onFailed();
});
```

The `elapsedMs` computed here is the same value passed to `onConnected`, replacing
the inline `Date.now() - startMs` that was there before.

`iceStateTransitions` is stored per-peer in `PeerMetrics` and written into the JSON
results file via `getMetrics()`. It is **not** aggregated in `MetricsCollector`
(transitions are per-peer debug data, not a phase-level stat). No new `PhaseStats`
field is needed and no reporter change is needed.

## Acceptance criteria

- [ ] `PeerMetrics.iceStateTransitions` is of type
      `Array<{ state: string; elapsedMs: number }>` (from obs-1)
- [ ] `onStateChange` in `TcpSignaledWrtcPeer.createPc` pushes every state (not just
      `'connected'` and `'failed'`) into `iceStateTransitions`
- [ ] Same for `WsSignaledWrtcPeer.createPc` and `WsStarPeer.createPc`
- [ ] `elapsedMs` values are monotonically increasing within a single peer's
      transition list
- [ ] The `onConnected` callback still receives the same elapsed value as before
- [ ] JSON results file contains `iceStateTransitions` per peer after a run
- [ ] `npm run build` and `npm test` pass

## Blocked by

obs-1 — `iceStateTransitions` field must exist on `PeerMetrics` before this change
can compile.
