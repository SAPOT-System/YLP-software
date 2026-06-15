# feat(webrtc-adapter): add stress-echo/stress-ack handler (dev + preview only)

## Parent

[PRD — Star mode round-trip latency via stress-echo/stress-ack](../superpowers/plans/2026-06-15-star-mode-roundtrip-latency.md)

## What to build

Add a `stress-echo` branch inside the existing `channel.onmessage` callback in
`WebRtcAdapter`, guarded by the `development` or `preview` build variant. When the
frame arrives and the guard passes:

1. Send `{ type: "stress-ack", seq: message.seq, sentAt: message.sentAt }` back over
   the data channel using the adapter's existing send helper.
2. `return` — do **not** fall through to `this.emit("receivedMessage", message)`. The
   frame must never reach `ChatService` or WatermelonDB.

The guard reads `Constants.expoConfig?.extra?.appVariant` (same pattern as
`UserStore`). The `stress-ack` shape must be added to the `WebrtcDataMessage` union so
TypeScript enforces it at the send site.

Place the new branch **after** the `ping`/`pong` liveness checks and **before** the
`receivedMessage` emit, consistent with the existing handler's structure.

## Acceptance criteria

- [ ] A `stress-echo` frame received when `appVariant` is `"development"` triggers a
      `stress-ack` reply with the same `seq` and `sentAt` values
- [ ] A `stress-echo` frame received when `appVariant` is `"preview"` triggers a
      `stress-ack` reply with the same `seq` and `sentAt` values
- [ ] A `stress-echo` frame received when `appVariant` is `"production"` (or absent)
      does **not** trigger a reply and falls through to `receivedMessage` emission
- [ ] A `stress-echo` frame in dev/preview does **not** emit `receivedMessage`
- [ ] If the data channel is closed when the reply is attempted, the failure is
      caught and logged at debug level — it does not throw
- [ ] `stress-ack` is part of the `WebrtcDataMessage` union (TypeScript enforces the
      shape)
- [ ] Tests cover: dev variant echoes, preview variant echoes, prod variant does not
      echo, frame does not reach `receivedMessage` in dev/preview
- [ ] `npm run typecheck` passes

## Blocked by

None — can start immediately.
