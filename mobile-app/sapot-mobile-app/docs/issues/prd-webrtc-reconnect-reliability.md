# PRD: WebRTC Reconnect Reliability

**Status:** Ready for implementation
**Label:** ready-for-agent, reliability, webrtc
**Scope:** features/shared/services/, features/shared/adapters/

## Progress

### Completed
1. Remove `_retryCount` internal retry loop from `connectToPeer` — commit 92503158f

### Remaining (recommended order)
1. Handle unexpected offer (peer Rebuild signal) in `WebrtcSessionManager`

---

## Problem Statement

Two bugs create a reconnect thrash loop when one peer's data channel closes unexpectedly:

**Bug A — Stacked retry loops:** `connectToPeer` contains an internal `_retryCount` guard that evicts the WebRTC adapter and redials on failure or timeout (up to 1 evict-and-redial per failure type, three code paths). ChatRoom independently runs its own exponential-backoff reconnect loop. When both loops fire on the same failure, up to two Rebuild cycles happen per attempt, amplifying the thrash and driving the "reconnecting" spinner into a visible oscillation.

**Bug B — Asymmetric Rebuild:** When one side loses its data channel and rebuilds (evicts its `RTCPeerConnection` and sends a fresh `offer`), the still-connected side receives that offer while its own PC is `connected` and `signalingState === "stable"`. The current `WebrtcAdapter.handleOffer` does not detect this as a Rebuild signal — it attempts to accept the offer on the existing, fully-established PC, producing an asymmetric state where one peer is a fresh callee and the other believes it is still connected. The result is a sustained reconnect thrash loop on real devices.

---

## Solution

**Fix A — Single-shot `connectToPeer`:** Strip `_retryCount` from `connectToPeer` entirely. All three internal retry paths (connection-failed, timeout, `createOffer` failure) become immediate rejections. The UI — specifically ChatRoom's existing backoff loop and `retriesExhausted` flag — is the sole reconnect owner for chat. Call setup surfaces failure to the caller without auto-retry.

**Fix B — Unexpected-offer Rebuild at `WebrtcSessionManager`:** In `WebrtcSessionManager`, detect when the target adapter reports `isConnected && signalingState === "stable"` before calling `handleOffer`. This condition means the peer has rebuilt. Evict the existing adapter, create a fresh `WebrtcAdapter`, and forward the offer to the fresh adapter so it can answer as a clean callee. The original `offer` message doubles as the restart signal — no new protocol message is needed.

---

## User Stories

1. As a rescuer in a chat room whose network briefly drops, I want the "Reconnecting…" indicator to appear once and resolve without looping, so that I trust the status bar reflects reality.

2. As a rescuer chatting over a flaky LAN connection, I want failed reconnect attempts to back off gracefully with a "Retry" button after exhausting retries, so that I can manually force a reconnect instead of waiting for an invisible loop.

3. As a rescuer who receives an incoming call, I want a one-sided data-channel loss to not trap both devices in a permanent reconnect thrash, so that the call recovers cleanly with a single offer/answer round trip.

4. As a developer on the connection subsystem, I want `connectToPeer` to be a single-shot operation (resolve or reject, no internal evict-and-redial), so that I can reason about retry behaviour by reading ChatRoom's backoff loop, not ConnectionService's internals.

5. As a developer adding a new failure mode to `connectToPeer`, I want there to be one place — the ChatRoom reconnect loop — where all retry policy lives, so that a new failure case does not require duplicating backoff logic inside the service.

6. As a developer writing a test for the reconnect flow, I want `connectToPeer` to reject with a single, deterministic error instead of internally swallowing one failure and retrying, so that my test can assert on one rejection without timing concerns.

7. As a developer reading the offer-handling path, I want an "unexpected offer while connected" to be a named concept at the `WebrtcSessionManager` level, so that a reviewer can understand Rebuild detection without tracing into `WebrtcAdapter` glare logic.

8. As a developer changing glare resolution in `WebrtcAdapter`, I want the "peer Rebuilt" case to be handled a layer above (in `WebrtcSessionManager`), so that `handleOffer` only sees clean-slate or genuine glare, not the asymmetric post-Rebuild case.

9. As a developer debugging a "stuck reconnecting" report, I want each failure event in the logs to correspond to exactly one Rebuild cycle, so that I can count reconnect attempts from the log and match them to real devices.

10. As a developer testing the call failure path, I want a failed initial dial on a poor network to surface a `connection-state: failed` event (not a silent internal retry), so that CallService can show "call failed" immediately and the user can redial manually.

11. As a rescuer on a poor network who fails to reach a peer, I want the call UI to show "call failed" clearly after one attempt, so that I know to try again instead of waiting for an invisible internal retry.

12. As a developer reading `WebrtcAdapter.handleOffer`, I want the code to assume the PC is always in a known clean state when it receives a call, so that the adapter's negotiation logic remains simple and auditable.

---

## Implementation Decisions

### Decision 1 — Remove `_retryCount` from `connectToPeer`

`connectToPeer` currently has three internal retry paths guarded by `_retryCount < 1`:
- `connection-failed` event listener → evict adapter + recursive call
- `setTimeout` handler (timeout) → evict adapter + recursive call
- `createOffer` failure handler → evict adapter + recursive call

All three blocks are removed. Each failure path transitions to:
```
emit connection-state(failed/timeout) → reject(error)
```

The `_retryCount` parameter is removed from the signature. The `evictWebrtcAdapter` call in the `createOffer` failure path is preserved (it prevents a dead PC from blocking the next connect attempt, which will now come from the UI layer).

**Caller impact:**
- `ChatService.connect` (called by ChatRoom's backoff loop) — no change; ChatRoom already owns retry policy.
- `CallService.initiateCall` — no change; call setup was already documented as no-auto-retry per ADR-0002.

### Decision 2 — Unexpected-offer Rebuild detection in `WebrtcSessionManager`

Before forwarding an `offer` to `WebrtcAdapter.handleOffer`, check:

```
if (adapter.isConnected && adapter.signalingState === "stable") {
  // Peer Rebuilt — evict our adapter and start fresh
  evictWebrtcAdapter(peerId)
  const freshAdapter = getWebrtcAdapter(peerId)  // creates new instance
  freshAdapter.handleOffer(offer)
} else {
  adapter.handleOffer(offer)
}
```

This means:
- `WebrtcAdapter` must expose `signalingState` (already accessed in existing debug traces).
- Eviction uses the same `evictWebrtcAdapter` already present in `WebrtcSessionManager`.
- The fresh adapter answers as a clean callee with no prior negotiation state.

**Constraint (from ADR-0001):** an unexpected offer now _always_ means Rebuild. Any future mid-session renegotiation (e.g. screen-share adding new m-lines) would trigger a destructive Rebuild instead of in-place renegotiation. This is acceptable because the app uses `replaceTrack` for camera/mic (no renegotiation needed). Revisit if that changes.

### Decision 3 — No new protocol messages

The existing `offer` message doubles as the Rebuild signal. No `reset`, `teardown`, or `rebuild-ack` message is added to the connection protocol.

### Decision 4 — `connection-state` event ordering preserved

When `connectToPeer` rejects without internal retry, the `connection-state` event (`failed` or `timeout`) must still be emitted _before_ rejection so that ChatRoom's listener can transition `connectionState` before the backoff timer fires. This ordering is already in the existing code; the refactor must preserve it.

---

## Testing Decisions

### What makes a good test here

Tests should assert on observable outcomes — `connection-state` events emitted, promise resolution/rejection, and `evictWebrtcAdapter` call counts — not on internal retry counter values. Use `jest.useFakeTimers()` to avoid real timeout waits.

### Modules to test

**`ConnectionService.connectToPeer` (unit)**
- On `connection-failed` event: emits `connection-state: failed`, rejects (no internal retry, evict not called)
- On timeout: emits `connection-state: timeout`, rejects (no internal retry, evict not called)
- On `createOffer` failure: evicts adapter once, emits `connection-state: failed`, rejects (no internal retry)
- Prior art: `features/shared/services/__tests__/connection-service.test.ts`

**`WebrtcSessionManager` (unit)**
- When adapter is connected + stable + offer arrives: `evictWebrtcAdapter` called once, fresh adapter's `handleOffer` called
- When adapter is not connected + offer arrives: existing adapter's `handleOffer` called, no eviction
- When adapter is connected + non-stable + offer arrives: existing adapter's `handleOffer` called (let `WebrtcAdapter` glare logic handle it)
- Prior art: mock patterns in `connection-service.test.ts`

---

## Out of Scope

- Mid-session track renegotiation (screen-share, new m-lines): explicitly excluded by ADR-0001.
- Call setup auto-retry: out of scope per ADR-0002 (user redials manually).
- ICE restart and liveness probe for mid-call drops: handled by the existing liveness probe path in `WebrtcAdapter`.
- ChatRoom reconnect loop changes: the loop is already correct. This PRD makes the service single-shot so the loop works as designed.
- GPS WebSocket reconnect: `GpsLocationService.scheduleReconnect` is a separate, unrelated mechanism.

---

## Further Notes

The two fixes are independent and can be implemented in any order. Fix A (single-shot `connectToPeer`) is recommended first — it removes the internal retry noise and makes the ChatRoom loop the only reconnect driver, stabilising observable behaviour and making Fix B easier to test in isolation.

After both fixes, a one-sided data-channel close should produce exactly one offer/answer round trip to convergence, with no liveness-timeout dependency and no stacked retry loops.
