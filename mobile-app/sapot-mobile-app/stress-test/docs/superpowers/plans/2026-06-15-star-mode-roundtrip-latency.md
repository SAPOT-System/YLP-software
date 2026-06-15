# PRD — Star mode round-trip latency via stress-echo/stress-ack

Status: ready-for-agent

Outcome of a grilling session on the 0% ack rate observed in tcp-signaled and
ws-signaled star modes. Identifies the two-layer root cause and captures the agreed
fix: a JSON echo handler in the phone app, gated to dev and preview builds, and
matching JSON send/receive logic in both star-mode peer classes.

## Problem Statement

When an operator runs the stress tester in star mode (all laptop peers targeting the
real phone), the **Chat** block always shows 0% delivery and 0ms latency. The operator
cannot measure round-trip latency to the phone — the only metric that distinguishes a
healthy star connection from a broken one.

There are two root causes:

1. **Wrong wire format.** The stress test sends `MSG:{seq}:{sentAt}` as a plain
   string. The phone's WebRTC adapter does `JSON.parse(event.data)` on every incoming
   data channel frame, so the plain string throws a `SyntaxError`, the error is caught
   and logged silently, and nothing is ever sent back.

2. **No echo handler.** Even with a parseable message, the phone has no path that
   echoes data channel frames back to the sender. Incoming messages flow into
   `ChatService.handleIncomingChatMessage`, which tries to persist a chat message to
   WatermelonDB — it does not reply.

The result is that `acked` stays at zero regardless of whether the data channel
actually opened. The operator sees 0% delivery, zero latency, and cannot tell whether
the transport is working.

## Solution

Add a `stress-echo` handler to the phone's WebRTC adapter, gated behind the
`development` and `preview` build variants. When the adapter receives a
`{ type: "stress-echo", seq, sentAt }` frame, it immediately replies with
`{ type: "stress-ack", seq, sentAt }` over the same data channel. No WatermelonDB
write, no ChatService involvement — just a synchronous echo.

Update both star-mode peer classes in the stress tester (`TcpSignaledWrtcPeer` and
`WsStarPeer`) to send JSON `stress-echo` frames and to parse `stress-ack` replies for
latency measurement. The existing `MSG:`/`ACK:` string format is removed from star
mode paths; pair-mode peers (`WsSignaledWrtcPeer`) are unaffected since they echo to
each other and do not involve the phone.

## User Stories

1. As an operator running the canonical star mode phone test, I want the Chat block to
   show real round-trip delivery rate and latency, so that I can tell whether the
   data channel transport to the phone is healthy.
2. As an operator, I want the stress test to send correctly formatted JSON frames, so
   that the phone can parse them without throwing a silent error.
3. As an operator, I want the phone to echo stress frames back immediately, so that
   latency measurement reflects the actual data channel round-trip time.
4. As an operator running a production build, I want the echo handler to be absent,
   so that arbitrary peers cannot trigger unbounded echo traffic on users' phones.
5. As an operator running against a preview build, I want the echo handler present,
   so that I can run star mode tests against preview releases before they go to prod.
6. As a developer reading the stress test code, I want the `MSG:`/`ACK:` plain-string
   format removed from star mode paths, so that there is one canonical wire format
   (JSON) for data channel probing.
7. As a developer, I want the echo handler to short-circuit before emitting
   `receivedMessage`, so that `stress-echo` frames never reach `ChatService` and do
   not create spurious messages in the database.
8. As a developer, I want pair-mode peers (`WsSignaledWrtcPeer`) to remain unchanged,
   so that the working pair-mode echo behavior is not disrupted.
9. As a developer maintaining the echo handler, I want the build-variant gate expressed
   as a single runtime check (`Constants.expoConfig?.extra?.appVariant`), following
   the existing pattern in `UserStore`, so that it is consistent with how the rest of
   the app reads the variant.
10. As a developer, I want the `stress-ack` reply to include the original `seq` and
    `sentAt` fields verbatim, so that the stress test can compute round-trip latency
    from `sentAt` without any clock synchronization between laptop and phone.

## Implementation Decisions

**Phone-side echo handler — `WebRtcAdapter.onmessage` (dev + preview only).**

The handler is a new branch inside the existing `channel.onmessage` callback, placed
after the `ping`/`pong` liveness checks and before the `receivedMessage` emit:

```
if (appVariant is "development" or "preview") {
  if message.type === "stress-echo":
    send { type: "stress-ack", seq: message.seq, sentAt: message.sentAt }
    return   // ← does NOT reach receivedMessage or ChatService
}
```

The build variant is read via `Constants.expoConfig?.extra?.appVariant` (same pattern
as `UserStore`). The reply uses the adapter's existing internal `sendDataMessage`
helper; it throws if the channel is not open, so the reply is wrapped in try/catch
with a debug-log on failure (same style as existing send paths).

The `stress-ack` shape is defined alongside the existing `WebrtcDataMessage` union so
TypeScript enforces the shape at the send site.

**Stress test wire format — `TcpSignaledWrtcPeer` and `WsStarPeer` (star paths only).**

`startSending` in both star-mode peers changes from:

```
dc.sendMessage(`MSG:${seq}:${sentAt}`)
```

to:

```
dc.sendMessage(JSON.stringify({ type: "stress-echo", seq, sentAt }))
```

The `onMessage` handler changes from `raw.startsWith('ACK:')` string parsing to:

```
const msg = JSON.parse(raw)
if msg.type === "stress-ack":
  latencyMs = Date.now() - msg.sentAt
  record acked + latency
```

`JSON.parse` is wrapped in try/catch; non-stress-ack frames (liveness pings, etc.) are
silently ignored. `TcpSignaledWrtcPeer`'s pair-mode paths (`MSG:`/`ACK:` string format)
are untouched — the plain-string echo loop between laptop peers continues to work
because both sides speak the same format. Only the star mode data channel send/receive
path changes.

**No change to pair-mode peers.**

`WsSignaledWrtcPeer` keeps its existing `MSG:`/`ACK:` string format. Both sides of a
pair are laptop-controlled so the format mismatch does not apply.

## Testing Decisions

Good tests assert external behavior through the highest available seam — not internal
parse branches.

- **Phone echo handler** — highest seam: simulate an incoming data channel message via
  the adapter's `onmessage` callback (stubbing the data channel), assert that
  `sendDataMessage` is called with `{ type: "stress-ack", seq, sentAt }` when the
  variant is dev/preview, and that it is NOT called when the variant is production.
  Also assert the frame does not emit `receivedMessage`. Prior art: existing WebRTC
  adapter unit tests that stub the data channel.

- **Star peer send format** — highest seam after a `startSending` call: capture what
  `dc.sendMessage` was called with and assert it is valid JSON with `type: "stress-echo"`,
  `seq`, and `sentAt` fields. For the ACK path: deliver a `stress-ack` JSON frame via
  `onMessage` and assert `getMetrics().acked` increments and `writeLatencySamples` is
  populated. Prior art: existing peer tests that mock the data channel's `onMessage`
  and `sendMessage`.

- **Malformed frame resilience** — assert that a non-JSON or non-stress-ack frame
  arriving on the star peer's data channel does not increment acked and does not throw.

Every change must leave `npm run build` and `npm test` green.

## Out of Scope

- Changing the pair-mode `MSG:`/`ACK:` string format in `WsSignaledWrtcPeer` or the
  pair path of `TcpSignaledWrtcPeer`.
- Adding authentication or nonce verification to the echo handler — the build variant
  gate is the security boundary.
- Making the echo handler configurable at runtime.
- Adding echo support to any WS-relay pair peer.
- Any change to ICE establishment, RTP media tracks, iperf, or network sampling.

## Further Notes

- Root cause found during a grilling session on the 0% ack result from a live
  `tcp-signaled --config verify-stress-test.config.json` run.
- The `dropped = 0` alongside `acked = 0, sent = 56` was the key diagnostic signal:
  all 56 frames were written successfully to the data channel (no socket-level failure),
  confirming the connection was open and the problem was purely the phone's silent
  discard of the unparseable plain string.
- ICE at 5745ms p50 in star mode (vs 1012ms in pair mode) is expected: pair mode uses
  loopback whereas star mode requires real LAN ICE traversal to the phone. Not a
  regression; no action needed.
