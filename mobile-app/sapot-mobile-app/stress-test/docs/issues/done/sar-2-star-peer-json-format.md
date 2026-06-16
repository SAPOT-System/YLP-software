# feat(stress-test): switch star-mode peers to JSON stress-echo/stress-ack format

## Parent

[PRD — Star mode round-trip latency via stress-echo/stress-ack](../superpowers/plans/2026-06-15-star-mode-roundtrip-latency.md)

## What to build

Update the **star-mode data channel send/receive paths** in `TcpSignaledWrtcPeer` and
`WsStarPeer` to use JSON `stress-echo` / `stress-ack` frames instead of the current
plain-string `MSG:`/`ACK:` format.

**`startSending` in both peers** — replace:

```
dc.sendMessage(`MSG:${this.seqNo++}:${sentAt}`)
```

with:

```
dc.sendMessage(JSON.stringify({ type: 'stress-echo', seq: this.seqNo++, sentAt }))
```

**`onMessage` / `setupDataChannel` in both peers** — replace the `raw.startsWith('ACK:')` string split with:

```
try {
  const msg = JSON.parse(raw)
  if (msg.type === 'stress-ack') {
    const latencyMs = Date.now() - msg.sentAt
    this.metrics.acked++
    this.metrics.writeLatencySamples.push(latencyMs)
    this.collector.recordAcked(this.peerId, msg.sentAt, latencyMs)
  }
} catch { /* non-JSON frame (e.g. liveness ping/pong) — ignore */ }
```

**Do not change** `WsSignaledWrtcPeer` or `TcpSignaledWrtcPeer`'s pair-mode paths.
The `MSG:`/`ACK:` string format is correct for laptop-to-laptop pair mode where both
sides speak the same protocol.

## Acceptance criteria

- [ ] `WsStarPeer.startSending` sends valid JSON with `{ type: "stress-echo", seq,
      sentAt }` — confirmed by capturing `dc.sendMessage` calls in tests
- [ ] `TcpSignaledWrtcPeer.startSending` sends valid JSON with `{ type: "stress-echo",
      seq, sentAt }` in star mode (when `phoneIp` is configured)
- [ ] A `stress-ack` frame delivered via `onMessage` increments `metrics.acked` and
      appends to `writeLatencySamples`
- [ ] A malformed JSON frame or a frame with an unrecognised `type` is silently ignored
      — does not increment acked, does not throw
- [ ] `TcpSignaledWrtcPeer` pair-mode paths (`MSG:`/`ACK:` format) are untouched and
      still pass their existing tests
- [ ] `WsSignaledWrtcPeer` is untouched and still passes its existing tests
- [ ] `npm run build` and `npm test` pass

## Blocked by

`sar-1` — the phone-side echo handler must exist before the new format can be
validated end-to-end. Unit tests for the stress test peers can be written
independently.
