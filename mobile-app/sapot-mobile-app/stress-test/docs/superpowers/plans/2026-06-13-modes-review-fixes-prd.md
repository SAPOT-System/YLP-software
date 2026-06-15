# PRD — Stress-test modes: truthful connectivity metric + review fixes

Status: ready-for-agent

Outcome of a code review + grilling session on the `tcp-signaled` and `ws-signaled`
transport modes. Captures the agreed fixes for the connectivity metric and several
smaller robustness/cleanup items.

## Problem Statement

When an operator runs the stress tester against the phone (star mode) or between
laptop peers (pair mode), the headline **"peers connected"** number lies. It is
derived from the *absence* of an error flag (`connectionErrors === 0`), computed
**before the phase even starts**. As a result:

- A **star peer** whose offer to the phone times out is still counted as connected,
  because the star peer records a timeout but not a connection error.
- A **pair-mode answerer** is never given a connection timeout at all, so an answerer
  whose link never completes is silently counted as connected.
- A peer that connects and then **drops mid-phase** is still counted as connected,
  because the count is taken at negotiation time and never revisited.

For the canonical phone test this is the single most important number, and the
operator cannot trust it.

Separately, the WebSocket auth call has a latent hang risk (a dead, commented-out
timeout), the active-users lookup has an undocumented protocol assumption, and there
is stale documentation and dead code left over from the removal of the old
`lan`/`ws`/`both`/`webrtc` modes.

## Solution

Make **"connected"** mean what an operator assumes it means: *the peer's
RTCPeerConnection was actually in the `connected` state at the end of the phase.*

- Each peer tracks the most recent state reported by its existing
  `onStateChange` handler and exposes a `connectedAtPhaseEnd` boolean from its
  metrics.
- The orchestrator reads this **at phase end** (after sending stops, before
  disconnect) for every peer — offerer, answerer, and star peer alike — and reports
  a single truthful `connectedPeers` count.
- Mid-phase drops count as failures. Never-connected counts as a failure.
- The existing error/timeout counters stay, but as **diagnostics** ("why didn't it
  connect") rather than the source of the headline number. The misleading pre-phase
  "connected" log line is removed.

Then fix the smaller items: give the auth request a real (signal-free) timeout,
document the active-users bare-array assumption, and remove the stale docs and dead
mode-label branches.

## User Stories

1. As an operator running the canonical phone test, I want the "peers connected" number to reflect peers whose WebRTC link actually reached the connected state, so that I can trust my headline result.
2. As an operator, I want a star peer whose offer to the phone timed out to be reported as **not** connected, so that the success count is not inflated.
3. As an operator, I want a pair-mode answerer whose link never completed to be reported as **not** connected, so that both sides of a pair are measured honestly.
4. As an operator, I want a peer that connected but then dropped during the load phase to be counted as a failure, so that I can see when a link did not survive the offered load.
5. As an operator, I want the connectivity count measured at phase end rather than at negotiation time, so that it captures the phase's actual outcome.
6. As an operator, I want to still see how many peers timed out and errored as separate diagnostic lines, so that I can understand *why* peers failed to connect.
7. As an operator, I want the confusing pre-phase "connected: X/Y" log line removed, so that the only connectivity number I see is the truthful phase-end one.
8. As an operator running `ws-signaled` against a slow or wedged server, I want the auth token request to fail after a bounded timeout, so that a single stuck peer cannot wedge a whole phase's spawn.
9. As an operator, I want the auth timeout implemented without breaking HTTPS/nginx server access, so that re-introducing the timeout does not regress normal runs.
10. As a developer maintaining the colocation loop, I want the active-users lookup's "resolve on first array" behavior documented against the server's wire format, so that the assumption is not re-flagged as a bug in future reviews.
11. As a developer reading the metrics, I want the audio RTP payload size documented accurately (32-byte payload / 44-byte packet), so that the docs match the code and tests.
12. As a developer reading the reporter, I want dead mode-label branches for the removed `lan`/`ws`/`both`/`webrtc` modes deleted, so that the code matches the two supported modes.
13. As a developer reading the metrics collector, I want the unused `computeStats` parameters removed, so that the signature reflects what the function actually uses.
14. As a developer, I want all three peer classes (`tcp-signaled`, `ws-signaled` pair, `ws-star`) to report `connectedAtPhaseEnd` consistently, so that the orchestrator can count them uniformly regardless of mode.
15. As a developer, I want peers to remain transport-pure with all aggregation flowing through `MetricsCollector`, so that the architecture conventions are preserved.

## Implementation Decisions

**Connectivity is observed, not inferred (replaces issues #1 and #4 from the review).**

- `PeerMetrics` gains a `connectedAtPhaseEnd: boolean` field (default `false` in
  `emptyMetrics()`).
- Each peer keeps a private `lastPcState` string, updated as the first line of the
  existing `onStateChange` callback in its `createPc`. No new `node-datachannel` API
  is used — the callback already runs for the connection's whole lifetime.
- `getMetrics()` in each peer sets `connectedAtPhaseEnd = lastPcState === 'connected'`
  at read time. Read after `stopSending` and **before** `disconnect` (disconnect
  closes the pc and would flip the state to `closed`), this is the authoritative
  per-peer truth.
- This applies to all three peer classes: `TcpSignaledWrtcPeer`,
  `WsSignaledWrtcPeer`, and `WsStarPeer`.

**Orchestrator counts at phase end.**

- `PhaseStats` gains `connectedPeers: number`.
- In both the `tcp-signaled` and `ws-signaled` branches, the orchestrator computes
  `connectedPeers` from `peers.filter(p => p.getMetrics().connectedAtPhaseEnd).length`
  after `stopSending` and before `disconnect`, and passes it into `computeStats`.
- The pre-phase `connected = peers.filter(... connectionErrors === 0)` log lines are
  **removed** from both branches.
- `MetricsCollector.computeStats` drops its unused `_startMs`/`_endMs` parameters
  (review issue #7) and instead accepts `connectedPeers`, placing it on the returned
  `PhaseStats`. Network throughput continues to be derived separately via the network
  sampler — `computeStats` never needed those timestamps.

**Reporter reads the truth and loses dead code.**

- `formatWebrtcBlock` reports `stats.connectedPeers` directly instead of
  `peerCount - stats.connectionErrors`.
- `connectionTimeouts` and `connectionErrors` remain as separate diagnostic lines in
  the WebRTC block.
- `getModeLabel` deletes the branches for the removed `ws`, `lan`, `both`, and
  `webrtc` modes (review issue #6), keeping only `ws-signaled` and `tcp-signaled`.

**Auth timeout without `signal` (review issue #2).**

- `fetchJwt` is wrapped in a `Promise.race` against a timeout promise. The `fetch`
  call is **not** given a `signal` — attaching an `AbortSignal` changes undici's
  socket teardown through nginx/TLS and produces spurious server-access errors.
- The timeout timer is `unref()`'d (so it cannot hold the event loop open) and
  cleared in a `.finally` (so a successful auth leaves no lingering handle).
- On timeout the race rejects with a plain `no response within Nms` error; the dead
  `TimeoutError`-name branch and the commented-out `AbortSignal.timeout` line are
  removed.
- Tradeoff accepted: on a real timeout the underlying socket drains in the
  background rather than being force-aborted; the caller unblocks immediately and the
  runner force-exits at the end regardless.

**`getVisiblePeerIds` assumption is documented, not re-architected (review issue #3).**

- The server handles `get-active-users` by returning a **bare JSON array** of userId
  strings with no `type` wrapper; no other server→peer frame on this socket is
  array-shaped. "Resolve on first array message" is therefore a correct discriminator
  against the real server.
- Add a code comment recording this (citing the server handler) and noting the
  colocation loop tolerates a rare stale cross-round response by retrying. No
  correlation machinery is added — the protocol is a bare array we do not control.

**Documentation (review issue #5).**

- Update `CLAUDE.md` and `README.md` where they describe the audio RTP payload as
  "3-byte" to the correct 32-byte payload / 44-byte packet.

## Testing Decisions

Good tests here assert **external behavior** through the highest existing seam, not
internal fields:

- **Peer connectivity (`tests/peers/*-wrtc-peer.test.ts`)** — the highest seam is the
  peer's `getMetrics()`. After a real loopback connection completes, `getMetrics()`
  reports `connectedAtPhaseEnd: true`; after disconnect/failure it reports `false`.
  Prior art: the existing `tcp-signaled-wrtc-peer` and `ws-signaled-wrtc-peer` tests
  already stand up real `RTCPeerConnection`s over `127.0.0.1`.
- **`MetricsCollector.computeStats` (`tests/metrics/collector.test.ts`)** — passing a
  `connectedPeers` value surfaces it on `PhaseStats`; the removed parameters no longer
  appear. Prior art: existing collector stat tests.
- **Reporter (`tests/metrics/reporter.test.ts`)** — `formatWebrtcBlock` renders the
  `connectedPeers` figure (not `peerCount - connectionErrors`) and still shows the
  timeout/error diagnostic lines; `getModeLabel` returns sensible labels for the two
  live modes and no longer special-cases removed modes. Prior art: existing reporter
  format tests.
- **`fetchJwt` (`tests/protocol/ws-protocol.test.ts`)** — against a stub server that
  never responds, `fetchJwt` rejects with a timeout message within the budget; against
  a fast stub it resolves and leaves no open handle. The `fetch` call is invoked
  without a `signal`. Prior art: existing ws-protocol tests.

Documentation-only items (`getVisiblePeerIds` comment, audio payload doc) have no
test.

Every issue must leave `npm run build` and `npm test` green.

## Out of Scope

- Changing the server's `get-active-users` response shape or adding request/response
  correlation to it.
- Adding a configurable auth timeout value (YAGNI — revisit only if real runs show
  false timeouts under load).
- Force-aborting the underlying auth socket on timeout.
- Any change to how iperf, the network sampler, discovery metrics, or media RTP
  generation work.
- Reviving any of the removed `lan`/`ws`/`both`/`webrtc` modes.

## Further Notes

- This work descends from a code review of the modes implementation
  (`tcp-signaled` + `ws-signaled`) and a follow-up grilling session that resolved the
  open design questions: connectivity is defined as *pc connected at phase end*,
  mid-phase drops are failures, error counters are demoted to diagnostics, the
  pre-phase log line is dropped, and the auth timeout must avoid `fetch`'s `signal`.
- The connectivity work is the spine; issues #2/#3/#5/#6/#7 are independent and can
  land in any order.
