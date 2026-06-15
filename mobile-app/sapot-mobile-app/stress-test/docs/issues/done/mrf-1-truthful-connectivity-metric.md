# feat(stress-test): measure peer connectivity at phase end, not by error flag

## Parent

[PRD — Stress-test modes: truthful connectivity metric + review fixes](../superpowers/plans/2026-06-13-modes-review-fixes-prd.md)

## What to build

Make the headline **"peers connected"** number reflect peers whose
`RTCPeerConnection` was actually in the `connected` state at the **end of the phase**,
across all three peer classes (`tcp-signaled`, `ws-signaled` pair, `ws-star`).

- Each peer records the latest state from its existing `onStateChange` handler and
  exposes a `connectedAtPhaseEnd` boolean through its metrics. No new
  `node-datachannel` API — reuse the callback that already runs for the connection's
  lifetime.
- The orchestrator reads this **after sending stops and before disconnect** for every
  peer (offerer, answerer, and star peer alike) and reports a single truthful
  `connectedPeers` count per phase.
- A peer that never connected, or connected and then dropped mid-phase, counts as
  **not connected**.
- The existing `connectionErrors` and `connectionTimeouts` counters remain, but as
  **diagnostic** lines explaining *why* peers failed — they no longer drive the
  headline count.
- Remove the misleading pre-phase `connected: X/Y` log line from both the
  `tcp-signaled` and `ws-signaled` orchestrator branches.
- While changing the `computeStats` signature to carry the connected count, drop its
  unused `_startMs`/`_endMs` parameters (review cleanup item).

Peers stay transport-pure — the orchestrator does the counting and all aggregation
flows through `MetricsCollector` / `PhaseStats`.

## Acceptance criteria

- [ ] `PeerMetrics` exposes `connectedAtPhaseEnd`, defaulting to `false`
- [ ] All three peers (`tcp-signaled`, `ws-signaled` pair, `ws-star`) report
      `connectedAtPhaseEnd: true` after a real loopback connection reaches `connected`,
      and `false` after it drops/fails/closes
- [ ] `PhaseStats` carries `connectedPeers`; the orchestrator computes it at phase end
      (after `stopSending`, before `disconnect`) for both modes
- [ ] `formatWebrtcBlock` reports `connectedPeers` instead of `peerCount - connectionErrors`
- [ ] `connectionTimeouts` and `connectionErrors` still appear as separate diagnostic
      lines in the WebRTC block
- [ ] The pre-phase `connected: X/Y` log line is removed from both orchestrator branches
- [ ] `computeStats` no longer takes the unused start/end timestamp parameters
- [ ] Peer-level tests assert `connectedAtPhaseEnd` via `getMetrics()` using real
      `RTCPeerConnection`s on `127.0.0.1` (prior art: existing tcp-/ws-signaled peer tests)
- [ ] Collector and reporter tests cover `connectedPeers` surfacing and rendering
- [ ] `npm run build` and `npm test` pass

## Blocked by

None - can start immediately.
