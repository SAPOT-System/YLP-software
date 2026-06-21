# Issue 2: Detect unexpected offer as peer Rebuild signal in `WebrtcSessionManager`

**Status:** Todo
**Label:** ready-for-agent, reliability, webrtc
**PRD:** [prd-webrtc-reconnect-reliability.md](./prd-webrtc-reconnect-reliability.md)
**Refs:** ADR-0001

## What

In `WebrtcSessionManager`, before forwarding an incoming `offer` to `WebrtcAdapter.handleOffer`, check whether the adapter is already fully connected (`isConnected === true && signalingState === "stable"`). If so, the peer has rebuilt its `RTCPeerConnection` unilaterally. Evict the existing adapter, create a fresh one, and forward the offer to the fresh adapter so it can answer as a clean callee.

`WebrtcAdapter` must expose a `signalingState` getter for this check (the raw value is already logged in debug traces; a getter just surfaces it as a typed property).

## Why

A one-sided data-channel close leaves the peers asymmetric: the rebuilding peer sends a fresh `offer`, but the still-connected peer accepts it on its live PC — producing a state where one side is a fresh callee and the other believes it is still connected. This is the root cause of the sustained reconnect thrash loop observed on real devices.

The fix requires no new protocol message: the fresh `offer` itself is the restart signal (ADR-0001).

## Acceptance criteria

- [ ] `WebrtcAdapter` exposes a `signalingState` getter returning the current `RTCPeerConnection.signalingState` (or `"closed"` if no PC exists)
- [ ] `WebrtcSessionManager` checks `adapter.isConnected && adapter.signalingState === "stable"` before dispatching an offer
- [ ] When check is true: `evictWebrtcAdapter(peerId)` called, fresh adapter created, offer forwarded to fresh adapter
- [ ] When check is false: existing adapter's `handleOffer` called as before (no change to glare logic inside the adapter)
- [ ] Comment at the check site documents the ADR-0001 constraint: unexpected offer always means Rebuild, not renegotiation
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes for affected unit tests

## Tests to write (TDD — write first)

In `features/shared/services/__tests__/webrtc-session-manager.test.ts`:

1. `receiveOffer evicts adapter and rebuilds when adapter is connected and stable`
   - Arrange: mock adapter with `isConnected=true`, `signalingState="stable"`, stub `handleOffer`
   - Act: trigger the offer dispatch path with a mock offer
   - Assert: `evictWebrtcAdapter` called once; fresh adapter's `handleOffer` called; original adapter's `handleOffer` NOT called

2. `receiveOffer forwards to existing adapter when not yet connected`
   - Arrange: mock adapter with `isConnected=false`
   - Assert: `evictWebrtcAdapter` NOT called; existing adapter's `handleOffer` called

3. `receiveOffer forwards to existing adapter when connected but not stable`
   - Arrange: mock adapter with `isConnected=true`, `signalingState="have-local-offer"`
   - Assert: `evictWebrtcAdapter` NOT called; existing adapter's `handleOffer` called

4. `WebrtcAdapter.signalingState returns "closed" when no peer connection exists`
   - Arrange: fresh `WebrtcAdapter` (no PC created yet)
   - Assert: `signalingState` returns `"closed"`

## Constraint (from ADR-0001)

An unexpected offer while connected **always** triggers a Rebuild. In-place renegotiation of an existing PC (e.g. adding screen-share m-lines via `addTrack`) is therefore unavailable — it would tear the connection down. Acceptable because the app uses `replaceTrack` for camera/mic. Document this constraint in a comment at the check site.
