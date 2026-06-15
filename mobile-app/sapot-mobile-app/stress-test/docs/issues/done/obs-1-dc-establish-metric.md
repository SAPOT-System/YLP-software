# feat(stress-test): track datachannel open time (dcEstablishMs)

## Parent

[PRD — Datachannel observability, media timeline, and message count control](../superpowers/plans/2026-06-15-observability-and-message-control.md)

## What to build

Register `dc.onOpen()` in `setupDataChannel` across all three peer classes
(`TcpSignaledWrtcPeer`, `WsSignaledWrtcPeer`, `WsStarPeer`) and record the time
from `connectTo()`/`negotiate()` start to datachannel open as `dcEstablishMs`.

**Step 1 — add `connectStartMs` to each peer class.**

Add a `private connectStartMs = 0` instance field. Set it to `Date.now()` at the
very top of `connectTo()` (TCP peer, offerer path) and at the top of `negotiate()`
(WS peers). For the TCP answerer path (lazy PC creation in `handleInbound`), set it
to the same `iceStartMs` that is already set there.

**Step 2 — update `PeerMetrics` and `emptyMetrics`.**

In `base-peer.ts`:
- Remove `wsPeakQueueFills: number` (dead code — see obs-6)
- Remove `mediaEstablishMs: number[]` (replaced — see obs-3)
- Add `dcEstablishMs: number[]`
- Add `iceStateTransitions: Array<{ state: string; elapsedMs: number }>` (used by obs-2)
- Add `audioEstablishMs: number[]` and `videoEstablishMs: number[]` (used by obs-3)

Update `emptyMetrics()` to initialise all new fields as empty arrays.

**Step 3 — register `dc.onOpen()` in `setupDataChannel`.**

In all three peer classes, inside `setupDataChannel(dc)`:

```typescript
dc.onOpen(() => {
  const elapsed = Date.now() - this.connectStartMs;
  this.metrics.dcEstablishMs.push(elapsed);
  this.collector.recordDcEstablish(this.peerId, elapsed);
});
```

**Step 4 — update `MetricsCollector` and `PhaseStats`.**

In `collector.ts`:
- Add `private dcEstablishSamples: number[] = []`
- Add `recordDcEstablish(_peerId: string, ms: number): void { this.dcEstablishSamples.push(ms); }`
- Add `dcEstablishP95Ms` to `PhaseStats` (computed with `pct(sorted, 95)`)
- Wire into `computeStats()` and `reset()`

**Step 5 — update `getMetrics()` in all three peer classes** to shallow-copy the new
arrays:

```typescript
dcEstablishMs: [...this.metrics.dcEstablishMs],
iceStateTransitions: [...this.metrics.iceStateTransitions],
audioEstablishMs: [...this.metrics.audioEstablishMs],
videoEstablishMs: [...this.metrics.videoEstablishMs],
```

The existing `mediaEstablishMs` copy line is removed.

**Step 6 — update `formatWebrtcBlock` in `reporter.ts`** to show `dcEstablishP95Ms`
after the ICE establish lines and before the Chat block:

```
  DC open p95             : ${stats.dcEstablishP95Ms}ms
```

## Acceptance criteria

- [ ] `PeerMetrics` has `dcEstablishMs: number[]` and no `mediaEstablishMs`
- [ ] `emptyMetrics()` initialises `dcEstablishMs`, `iceStateTransitions`,
      `audioEstablishMs`, `videoEstablishMs` as empty arrays
- [ ] `setupDataChannel` registers `dc.onOpen()` in all three peer classes
- [ ] `connectStartMs` is set before `createPc` is called in every path (offerer TCP,
      answerer TCP via `handleInbound`, both WS peers in `negotiate`)
- [ ] `MetricsCollector` has `recordDcEstablish` and `PhaseStats` has `dcEstablishP95Ms`
- [ ] `formatWebrtcBlock` prints `DC open p95` between ICE and Chat sections
- [ ] `npm run build` and `npm test` pass with no type errors

## Blocked by

None — interface changes in `base-peer.ts` should land first so the compiler
catches missed call sites in `getMetrics()`.
