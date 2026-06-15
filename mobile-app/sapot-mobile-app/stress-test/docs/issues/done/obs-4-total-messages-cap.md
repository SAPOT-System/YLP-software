# feat(stress-test): per-peer totalMessages cap on Phase config and startSending

## Parent

[PRD — Datachannel observability, media timeline, and message count control](../superpowers/plans/2026-06-15-observability-and-message-control.md)

## What to build

Add an optional `totalMessages` field to the `Phase` config type. When set, each
peer self-terminates its send interval after sending exactly that many messages.
The phase continues running for `durationSec` (iperf and network sampling are
unaffected); only the message interval stops early.

**In `test-config.ts`**, add to `Phase`:

```typescript
export interface Phase {
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
  totalMessages?: number;
  runIperf?: boolean;
}
```

**In `BasePeer`**, update the signature:

```typescript
startSending(msgPerSec: number, totalMessages?: number): void;
```

**In all three peer classes**, update `startSending`:

```typescript
startSending(msgPerSec: number, totalMessages?: number): void {
  const intervalMs = Math.max(10, Math.floor(1_000 / msgPerSec));
  this.sendTimer = setInterval(() => {
    if (!this.dc?.isOpen()) return;
    if (totalMessages !== undefined && this.metrics.sent >= totalMessages) {
      clearInterval(this.sendTimer!);
      this.sendTimer = null;
      return;
    }
    const sentAt = Date.now();
    const ok = this.dc.sendMessage(`MSG:${this.seqNo++}:${sentAt}`);
    if (ok) {
      this.metrics.sent++;
      this.collector.recordSent(this.peerId, sentAt);
    } else {
      this.metrics.dropped++;
      this.collector.recordDropped(this.peerId);
    }
  }, intervalMs);
  // audio/video timer setup unchanged
}
```

**In `orchestrator.ts`**, update both `startSending` call sites:

```typescript
peers.forEach((p) => p.startSending(phase.msgPerSec, phase.totalMessages));
```

No validator change is needed — `totalMessages` is optional and any positive integer
is valid.

## Acceptance criteria

- [ ] `Phase` has `totalMessages?: number`
- [ ] `BasePeer.startSending` signature is `(msgPerSec: number, totalMessages?: number): void`
- [ ] All three peer classes implement the updated signature
- [ ] When `totalMessages` is set to N, `getMetrics().sent` equals exactly N after
      the interval has had more than N ticks (interval self-terminated)
- [ ] When `totalMessages` is undefined, behaviour is unchanged (time-bounded only)
- [ ] Both `startSending` call sites in the orchestrator pass `phase.totalMessages`
- [ ] `npm run build` and `npm test` pass

## Blocked by

None — can be implemented independently of obs-1 through obs-3, but the `BasePeer`
signature must be updated before touching the peer class implementations.
