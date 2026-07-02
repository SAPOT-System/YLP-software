# The UI owns reconnect; `connectToPeer` is single-shot

## Context

Two retry loops drove peer connection: `connectToPeer`'s internal
`_retryCount` (evict-and-redial, used by chat *and* calls) and ChatRoom's
`scheduleReconnect` (UI, chat only). Stacked, they produced ~2 Rebuilds per
reconnect attempt and amplified the thrash loop.

## Decision

`connectToPeer` becomes single-shot: build PC, offer, await
`connection-established` or timeout, then resolve/reject — no internal evict-and-
redial, and no eviction on first timeout (so it cannot pre-empt a peer's Quiet
callee-rebuild answer still in flight). The **UI is the sole reconnect owner**
(ChatRoom's backoff + `retriesExhausted` + manual retry).

## Consequences

- One Rebuild per failure instead of two.
- **Call setup has no auto-retry.** Calls have no ChatRoom-style loop, so a
  failed initial dial surfaces "call failed" and the user redials manually.
  Mid-call drops are unaffected — those are handled by ICE restart + the
  liveness probe, not by `connectToPeer`. Revisit if call-setup reliability on
  poor networks proves insufficient.
