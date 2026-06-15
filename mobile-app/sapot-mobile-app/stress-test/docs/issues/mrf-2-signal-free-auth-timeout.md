# fix(stress-test): give ws-signaled auth a bounded, signal-free timeout

## Parent

[PRD — Stress-test modes: truthful connectivity metric + review fixes](../superpowers/plans/2026-06-13-modes-review-fixes-prd.md)

## What to build

The WebSocket auth token request (`fetchJwt`) currently has no timeout — a slow or
wedged server can block a peer's `connect()` indefinitely and stall a whole phase's
spawn. The previous attempt used a commented-out `AbortSignal.timeout`, which is left
disabled because attaching an `AbortSignal` to `fetch` changes undici's socket
teardown through nginx/TLS and causes spurious server-access errors.

Add a real timeout **without** passing `signal` to `fetch`: race the `fetch` against a
timeout promise. The timeout timer must be `unref()`'d so it cannot hold the event
loop open, and cleared in a `finally` so a successful auth leaves no lingering handle.
On timeout, reject with a plain `no response within Nms` message. Remove the dead
`TimeoutError`-name branch and the commented-out `AbortSignal.timeout` line.

Accepted tradeoff: on a real timeout the underlying socket drains in the background
rather than being force-aborted; the caller unblocks immediately and the runner
force-exits at the end regardless.

## Acceptance criteria

- [ ] `fetchJwt` rejects with a timeout message when the server does not respond within
      the budget
- [ ] `fetch` is called **without** a `signal` option
- [ ] The timeout timer is `unref()`'d and cleared on success (no lingering handle)
- [ ] The dead `TimeoutError` catch branch and commented-out `AbortSignal.timeout` line
      are removed
- [ ] A successful auth against a fast stub still resolves and leaves no open handle
- [ ] Tests cover both the no-response (timeout) and fast-response (success) paths
      (prior art: existing ws-protocol tests)
- [ ] `npm run build` and `npm test` pass

## Blocked by

None - can start immediately.
