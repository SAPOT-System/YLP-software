# feat(stress-test): split mediaEstablishMs into audioEstablishMs / videoEstablishMs with correct t=0

## Parent

[PRD — Datachannel observability, media timeline, and message count control](../superpowers/plans/2026-06-15-observability-and-message-control.md)

## What to build

Replace the single `mediaEstablishMs` array with separate `audioEstablishMs` and
`videoEstablishMs` arrays. Fix the `t=0` for both to be `connectStartMs` (set in
obs-1) rather than the moment `setupAudioTrack` was called. Add `setupVideoTrack`
(currently video track open time is never recorded).

**In all three peer classes:**

**`setupAudioTrack`** — change timer start from the locally captured `Date.now()` to
`this.connectStartMs`:

```typescript
private setupAudioTrack(track: Track): void {
  this.audioTrack = track;
  track.onOpen(() => {
    const elapsed = Date.now() - this.connectStartMs;
    this.metrics.audioEstablishMs.push(elapsed);
    this.collector.recordAudioEstablish(this.peerId, elapsed);
  });
}
```

**Add `setupVideoTrack`** — mirrors `setupAudioTrack`:

```typescript
private setupVideoTrack(track: Track): void {
  this.videoTrack = track;
  track.onOpen(() => {
    const elapsed = Date.now() - this.connectStartMs;
    this.metrics.videoEstablishMs.push(elapsed);
    this.collector.recordVideoEstablish(this.peerId, elapsed);
  });
}
```

**In `createPc`**, replace the direct `this.videoTrack = pc.addTrack(video) as Track`
assignment with:

```typescript
this.setupVideoTrack(pc.addTrack(video) as Track);
```

**In `MetricsCollector`:**
- Remove `mediaEstablishSamples`, `recordMediaEstablish`, `mediaEstablishP95Ms`
- Add `audioEstablishSamples`, `videoEstablishSamples`
- Add `recordAudioEstablish` and `recordVideoEstablish`
- Add `audioEstablishP95Ms` and `videoEstablishP95Ms` to `PhaseStats`
- Wire into `computeStats()` and `reset()`

**In `formatWebrtcBlock` in `reporter.ts`**, replace the single media line with two
(inside the existing `rtpPacketsSent > 0` guard):

```
  audio establish p95     : ${stats.audioEstablishP95Ms}ms
  video establish p95     : ${stats.videoEstablishP95Ms}ms
```

## Acceptance criteria

- [ ] `PeerMetrics` has `audioEstablishMs` and `videoEstablishMs`; no `mediaEstablishMs`
- [ ] `setupAudioTrack` uses `this.connectStartMs` as `t=0` in all three peer classes
- [ ] `setupVideoTrack` exists in all three peer classes and registers `onOpen`
- [ ] `createPc` calls `setupVideoTrack` instead of directly assigning `this.videoTrack`
- [ ] `MetricsCollector` has `recordAudioEstablish` and `recordVideoEstablish`; no
      `recordMediaEstablish`
- [ ] `PhaseStats` has `audioEstablishP95Ms` and `videoEstablishP95Ms`; no
      `mediaEstablishP95Ms`
- [ ] `formatWebrtcBlock` prints two lines (audio and video p95) where it previously
      printed one
- [ ] `npm run build` and `npm test` pass

## Blocked by

obs-1 — `audioEstablishMs`, `videoEstablishMs`, and `connectStartMs` must exist
before this change can compile.
