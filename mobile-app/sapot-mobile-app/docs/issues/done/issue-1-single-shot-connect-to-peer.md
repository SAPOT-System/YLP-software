# Issue 1: Make `connectToPeer` single-shot (remove internal `_retryCount` retry)

**Status:** Todo
**Label:** ready-for-agent, reliability, webrtc
**PRD:** [prd-webrtc-reconnect-reliability.md](./prd-webrtc-reconnect-reliability.md)
**Refs:** ADR-0002

## What

Remove the `_retryCount` parameter and all three internal evict-and-redial retry paths from `ConnectionService.connectToPeer`. Each failure now emits the appropriate `connection-state` event and rejects immediately — no recursive call, no internal adapter eviction on connection-failed or timeout.

The `evictWebrtcAdapter` call in the `createOffer` failure path is preserved (dead PC must be cleared so the next attempt from the UI gets a fresh one).

## Why

ChatRoom already owns an exponential-backoff reconnect loop with `retriesExhausted` + manual retry. The internal retry in `connectToPeer` stacks on top, producing up to two Rebuild cycles per failure and amplifying the reconnect thrash visible in the "Reconnecting…" spinner.

## Acceptance criteria

- [ ] `_retryCount` parameter removed from `connectToPeer` signature
- [ ] All three `if (_retryCount < 1 && ...)` blocks removed
- [ ] On `connection-failed` event: `connection-state: failed` emitted, promise rejects, `evictWebrtcAdapter` NOT called
- [ ] On timeout: `connection-state: timeout` emitted, promise rejects, `evictWebrtcAdapter` NOT called
- [ ] On `createOffer` failure: `evictWebrtcAdapter` called once, `connection-state: failed` emitted, promise rejects
- [ ] `connection-state` event is emitted BEFORE the promise rejects (ordering preserved for ChatRoom listener)
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes for `features/shared/services/__tests__/connection-service.test.ts`

## Tests to write (TDD — write first)

In `features/shared/services/__tests__/connection-service.test.ts`:

1. `connectToPeer rejects immediately on connection-failed without internal retry`
   - Arrange: mock `createOffer` to succeed, emit `connection-failed` on the webrtcAdapter
   - Assert: promise rejects; `evictWebrtcAdapter` not called; `connection-state: failed` event emitted once

2. `connectToPeer rejects immediately on timeout without internal retry`
   - Arrange: use fake timers; `createOffer` succeeds; timeout fires before `connection-established`
   - Assert: promise rejects; `evictWebrtcAdapter` not called; `connection-state: timeout` event emitted once

3. `connectToPeer evicts adapter and rejects on createOffer failure`
   - Arrange: mock `createOffer` to reject
   - Assert: `evictWebrtcAdapter` called once; `connection-state: failed` emitted; promise rejects

4. `connectToPeer emits connection-state before rejecting`
   - Arrange: trigger a failure path
   - Assert: `connection-state` handler fires before the rejection catch block
