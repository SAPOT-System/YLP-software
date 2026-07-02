# An unexpected offer triggers a full Rebuild, not in-place renegotiation

## Context

A one-sided WebRTC data-channel close leaves the peers asymmetric: one side
Rebuilds (fresh `RTCPeerConnection`) while the other still believes it is
connected and ignores the fresh offer, producing a sustained reconnect thrash
loop on real devices.

## Decision

The still-connected side treats an **Unexpected offer** (an `offer` received
while `isConnected && signalingState === "stable"`) as proof the peer Rebuilt.
It evicts its own adapter, builds a fresh PC, and answers as a clean callee. The
existing `offer` message doubles as the restart signal — we deliberately do
**not** add a dedicated reset/teardown message to the connection protocol.

## Consequences

- Recovery is deterministic and message-free: one offer/answer round trip
  converges both sides onto fresh PCs. No reliance on liveness-timeout timing.
- **Constraint baked in:** an unexpected offer *always* means Rebuild. In-place
  renegotiation of an existing PC (e.g. a future `addTrack` for screen-share
  introducing new m-lines) is therefore unavailable — it would tear the
  connection down instead. Acceptable because the app currently renegotiates
  no tracks mid-session (camera/mic use `replaceTrack`). Revisit this ADR if
  mid-session track renegotiation is ever required.
