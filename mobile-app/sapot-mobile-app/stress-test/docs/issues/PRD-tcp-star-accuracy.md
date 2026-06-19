# PRD: TCP-star metric accuracy fixes

Labels: `ready-for-agent`
Related: ADR-0003, ADR-0004, ADR-0005 · CONTEXT.md · PRD-establishment-ceiling.md

## Problem Statement

After running the tcp-signaled star test at 20 peers, the operator gets three readings that
are wrong or misleading:

1. **`connectedPeers: 3` with `iceEstablishP50Ms: 0`** — three zombie connections (ICE
   completed *after* the laptop timeout fired) are counted as successful sessions and suppress
   the ICE establish timing. The ceiling looks like 15% success instead of 0%.

2. **`neverArrived: 20` when the phone clearly processed the offers** — the phone logs
   `addIceCandidate` for all 20 peers, but every timed-out peer is labelled "never-arrived"
   because the attribution only has two buckets (phone-refused / never-arrived). There is no
   bucket for offers that arrived but whose ICE stalled on the phone side.

3. **`DEGRADED` link-health alert on healthy hardware-capped WiFi** — the absolute 10 Mbps
   floor fires on a link that shows identical baseline and under-load throughput (8 Mbps),
   producing a false alarm on every run on this hardware.

Together these make the 20-peer result uninterpretable: the operator cannot tell whether
connections failed due to a transport problem, a phone-side resource limit, or a link issue.

## Solution

Four targeted fixes, each independently deployable:

1. **Zombie connection guard** — only count a peer as connected, and only record its ICE
   establish time, if ICE completed before the laptop's timeout.

2. **Three-bucket attribution** — split the attribution into phone-refused, arrived-but-stalled
   (offer reached the phone's WebRTC stack but ICE never finished), and never-arrived. Use
   count-based matching against `session › accepted` logcat events.

3. **Relative link-health threshold** — flag DEGRADED only when under-load throughput drops
   more than 15% below the measured baseline, plus an absolute 2 Mbps safety floor. Remove
   the absolute 10 Mbps floor.

4. **`mediaInSdp` flag** — record whether at least one media track was successfully added to
   the RTCPeerConnection before offer generation. Document that `rtpPacketsSent: 0` is
   expected (both sides are SendOnly; no receiver negotiated) and is not a bug.

## User Stories

1. As the operator, I want `connectedPeers` to count only peers whose ICE completed before
   the timeout, so that zombie connections don't inflate the success rate.
2. As the operator, I want `iceEstablishMs` recorded only for pre-timeout connections, so
   that ICE timing percentiles reflect actual observed latency.
3. As the operator, I want an `arrivedButStalled` counter in the attribution block, so that I
   can distinguish "phone saw the offer but ICE stalled" from "offer never reached the phone."
4. As the operator, I want `neverArrived` to mean specifically "no `session › accepted` event
   matched this timeout", so that the term is unambiguous per the CONTEXT.md glossary.
5. As the operator, I want the link-health check to compare under-load throughput against the
   measured baseline (not an absolute floor), so that hardware-capped WiFi links don't
   produce false DEGRADED alerts.
6. As the operator, I want a 2 Mbps absolute safety floor retained, so that a genuinely
   unusable link is still flagged even if under-load matches baseline.
7. As the operator, I want `mediaInSdp: boolean` in the per-phase output, so that I can
   confirm media was negotiated in the SDP without being misled about RTP delivery.
8. As the operator, I want the output to document that `rtpPacketsSent: 0` is expected when
   `mediaInSdp: true`, so that I don't file it as a bug.
9. As the operator, I want the validation experiment (20-peer run at 20 s timeout) to confirm
   the JS-thread starvation hypothesis before the phone-side fix is applied, so that the root
   cause is proven before we change production app code.

## Implementation Decisions

- **Zombie guard.** `connectedAtPhaseEnd = true` moves inside the `onConnected` callback
  (inside the pre-timeout path). The raw RTCPeerConnection state-change handler no longer
  writes `connectedAtPhaseEnd`. A peer that connects after the timeout is neither counted in
  `connectedPeers` nor in `iceEstablishMs`.

- **Three-bucket attribution.** `classifyFailures(events, connectionTimeouts)` gains a third
  return value:
  - `phoneRefused` = count of `session › rejected` events (unchanged)
  - `arrivedButStalled` = `min(accepted event count, connectionTimeouts − phoneRefused)`
  - `neverArrived` = `connectionTimeouts − phoneRefused − arrivedButStalled`
  Matching is count-based (not per-peerId). `PhaseStats`, the result JSON, and the reporter
  attribution block all gain `arrivedButStalled`.

- **Relative link health.** `isLinkHealthy` receives both baseline and under-load iperf
  stats. Default thresholds: `maxDegradationFactor: 0.15`, `minThroughputMbps: 2`,
  `maxLossPercent: 1`. DEGRADED when under-load throughput drops more than 15% below
  baseline OR falls below 2 Mbps. When no under-load data is available, only the 2 Mbps
  absolute floor applies.

- **`mediaInSdp` flag.** Each peer tracks whether any `addTrack` call succeeded (boolean set
  inside the try/catch in the PC setup path). The collector aggregates this as `mediaInSdp:
  true` if any peer reported it. The reporter prints it in the WebRTC block alongside a note
  that `rtpPacketsSent: 0` is expected when both sides are SendOnly.

- **Validation sequence.** Before applying any phone-side change, re-run the 20-peer star
  test with `connectionTimeoutMs: 20000`. If more peers connect, JS-thread starvation
  (WatermelonDB `db.write()` on the `peer-identity` hot path blocking ICE callbacks) is
  confirmed. The phone-side fix is a separate follow-on tracked outside this repo.

## Testing Decisions

- **Good tests** exercise the pure decision functions with data fixtures; they do not test
  internal state or implementation paths. Mirror the style of
  `tests/discovery/session-log-parser.test.ts` and `tests/metrics/collector.test.ts`.

- **`classifyFailures`** — cases: zero timeouts; all phone-refused; accepted count exceeds
  timeouts (min clamp fires); accepted count below timeouts (partial stall); no accepted
  events (all never-arrived).

- **`isLinkHealthy`** — cases: under-load within 15% (healthy); under-load drops 16%
  (degraded by ratio); under-load below 2 Mbps absolute floor; null under-load (baseline-only
  path); null baseline (pass-through healthy).

- **`MetricsCollector.computeStats`** — assert `arrivedButStalled` present; assert
  `mediaInSdp` aggregated correctly from per-peer flags.

- **Reporter** — assert `arrivedButStalled` in the attribution block; assert `mediaInSdp` in
  the WebRTC block.

- **Zombie guard** — assert that a peer whose timeout fires before ICE has
  `connectedAtPhaseEnd: false` and no `iceEstablishMs` entry even if the PC later reaches
  'connected'.

## Out of Scope

- The phone-side `void updatePeerInfo` fix (mobile app code, separate repo/branch).
- Per-peerId attribution matching (count-based is sufficient).
- Adding a RecvOnly track to unblock actual RTP delivery.
- Surplus DB writer count investigation (30–34 vs expected 20).
- Increasing the peer-count ramp beyond 20 peers until the root cause is confirmed.

## Further Notes

- CONTEXT.md has been updated with `phone-refused`, `arrived-but-stalled`, `never-arrived`,
  and `mediaInSdp` as canonical terms.
- ADR-0005 covers the session-log contract; the three-bucket split extends the classification
  step of that contract, not the log format itself.
- The validation run (20 s timeout) is a temporary experiment; `verify-stress-test.config.json`
  carries it, not the production config.
