# PRD: Trustworthy phone/AP session ceiling

Labels: `ready-for-agent`
Related: ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005 · CONTEXT.md

## Problem Statement

As the operator of the stress test, I run it to learn one thing: **how many simulated peers
can engage the phone over one access point before sessions stop forming cleanly.** Today the
tool prints numbers I can't trust for that question. "Packet loss" is really sender-side
send-queue backpressure; the `packetLossPercent` column is derived from host TCP
retransmits that never carry the WebRTC traffic; synthetic media has no congestion control
so media-quality numbers are meaningless; and when a phase fails I can't tell whether the
**phone** hit its limit or my **laptop** (driving all the peers through one event loop) did.
So a "ceiling" reading might just be my laptop saturating, and I'd never know.

## Solution

Re-scope the tool to measure only what it can measure faithfully — **establishment
integrity** — and bracket every measurement with health gates so the ceiling is cleanly
attributable to the phone:

- The **session ceiling** is the highest peer count where ICE-connected success rate stays
  ≥ 95% on a phase that passed the laptop-health gate.
- A **laptop gate** (loopback control baseline + in-situ event-loop lag) proves the laptop
  wasn't the bottleneck; contaminated phases are excluded.
- A **link gate** (pre-run iperf baseline) proves the AP/link was healthy.
- **Phone-side session logs** attribute each failure (phone-refused vs never-arrived), so a
  degraded reading points at the phone.
- Misleading metrics are deleted or honestly renamed; throughput/loss become gates, not
  headline outputs; media is load-only.

## User Stories

1. As the operator, I want the report to state a single session-ceiling peer count, so that I have one clear answer to "how many callers can the phone sustain."
2. As the operator, I want the ceiling defined as the highest peer count with ICE-connected success ≥ 95%, so that the number is reproducible across runs.
3. As the operator, I want only phases that passed the laptop-health gate to count toward the ceiling, so that I never mistake laptop saturation for a phone limit.
4. As the operator, I want event-loop lag sampled during each phase, so that I can see when the laptop's event loop was overloaded.
5. As the operator, I want phases whose event-loop p95 lag exceeded the threshold flagged and excluded from the ceiling, so that contaminated data does not skew the result.
6. As the operator, I want a one-time loopback control run at the same peer counts, so that I have a baseline for the laptop's own establishment capacity.
7. As the operator, I want loopback control peers to do the same DTLS and media work as star peers, so that the baseline isn't wildly optimistic about laptop capacity.
8. As the operator, I want the report to confirm the laptop's loopback ceiling sits well above the phone ceiling, so that I can trust the phone was the binding constraint.
9. As the operator, I want a pre-run iperf baseline that confirms the AP/link is healthy, so that I don't attribute link congestion to the phone.
10. As the operator, I want the run flagged when the link baseline is degraded, so that I know to re-run on a clean link.
11. As the operator, I want iperf throughput/loss removed from the per-phase ceiling metrics and saturation analysis, so that the report stops implying it measures the network.
12. As the operator, I want the tcpRetrans-derived `packetLossPercent` column deleted, so that I am not shown a loss figure that has nothing to do with the WebRTC traffic.
13. As the operator, I want the send-queue "dropped" counter renamed `txQueueOverflow`, so that I understand it is local backpressure, not network loss.
14. As the operator, I want the RTP-loss metric removed, so that I am not shown a media-loss figure that is really send-queue failures.
15. As the operator, I want the data-channel RTT stddev labelled "RTT stddev" rather than "jitter," so that I don't mistake it for RFC-3550 jitter.
16. As the operator, I want canonical runs to use audio-video calls as pure load, so that the phone is stressed the way a real call deployment would stress it.
17. As the operator, I want no media-quality metric reported, so that the report does not overclaim what synthetic media can measure.
18. As the operator, I want the phone to log session accepted/rejected and its active-session count, so that failures can be attributed to the phone.
19. As the operator, I want the orchestrator to classify each establishment failure as phone-refused vs never-arrived, so that a timeout-heavy phase can prove (or not) that the phone hit its limit.
20. As the operator, I want the phone session-log lines present only in development and preview builds, so that production stays clean (per ADR-0002's gate).
21. As the operator, I want the report to show secondary early-warning signals (ICE-establish p95, timeout rate), so that I can see degradation approaching before the 95% cut-line trips.
22. As the operator, I want the loopback smoke mode retained for CI/protocol checks, so that I can validate the wire protocol without a phone (per ADR-0001).
23. As an app developer, I want the phone session-log contract documented, so that I don't silence or reformat lines the stress test depends on.
24. As the operator, I want each validity gate's pass/fail surfaced in the report, so that I can see WHY a given phase did or didn't count.
25. As the operator, I want the lag threshold to be calibratable per laptop, so that absolute ceiling numbers are portable after recalibration.

## Implementation Decisions

- **Establishment-only scope (ADR-0004).** The ceiling is establishment integrity alone.
  Throughput and loss are demoted to validity gates, not outputs.
- **Ceiling rule.** A pure `determineCeiling(phases, { successThreshold: 0.95 })` returns the
  highest peer count whose phase has ICE-connected success ≥ 95% AND passed the lag gate.
  ICE-establish p95 and timeout rate are reported as secondary only.
- **Laptop gate (ADR-0003).** An `EventLoopLagSampler` adapter (sibling of `NetworkSampler`)
  samples event-loop lag per phase. A pure `isPhaseLagValid(samples, thresholdMs)` decides
  validity; lag is authoritative and excludes contaminated phases. A one-time loopback
  control run at the same peer counts produces a laptop baseline; a pure
  `assessLaptopHeadroom(loopbackCeiling, phoneCeiling)` reports whether the laptop had
  headroom. Loopback control peers must add the same DTLS + media tracks as star peers.
- **Link gate.** A pure `isLinkHealthy(iperfBaseline, thresholds)` flags the run when the
  pre-run iperf baseline is degraded. iperf throughput/loss is removed from per-phase ceiling
  metrics and from saturation analysis.
- **Metric cleanup.** `PeerMetrics.dropped` → `txQueueOverflow`; delete the tcpRetrans-derived
  `packetLossPercent` from `NetworkStats`/`PhaseStats`/the table; delete `rtpPacketsLost`
  reporting (media is load-only); rename the latency stddev output to "RTT stddev."
- **Phone attribution (ADR-0005).** A pure `parseSessionEvents(logText)` returning typed
  `SessionEvent`s (sibling of `logcat-parser`) feeds orchestrator logic that classifies each
  failure as phone-refused vs never-arrived. The app emits session accepted/rejected +
  active-count log lines, present when `APP_VARIANT` is development or preview, stripped in
  production.
- **Reporting.** Each phase's gate verdicts (laptop gate, link gate) are surfaced; the final
  report states the single ceiling number plus the secondary early-warning signals.

## Testing Decisions

- **Test external behavior via the high pure seams**, never private state. Each decision
  function is tested as data-in/verdict-out with fixtures — exactly like the existing
  `logcat-parser`, `computeNetworkStats`, and `MetricsCollector.computeStats` tests.
- **Modules under test:**
  - `determineCeiling` — given crafted `PhaseStats[]`, returns the right ceiling; ignores
    lag-invalid phases; handles "never degrades within range" and "degrades immediately."
  - `isPhaseLagValid` — threshold boundary behavior on sampled lag arrays.
  - `isLinkHealthy` — healthy vs degraded iperf baselines.
  - `assessLaptopHeadroom` — headroom present / borderline / absent.
  - `parseSessionEvents` — accept/reject/active-count lines, malformed lines, empty input
    (mirror `logcat-parser.test.ts` fixture style).
  - `MetricsCollector` / reporter — updated for the rename/deletions; assert the old fields
    are gone and `txQueueOverflow` is populated.
- **Prior art:** `tests/metrics/collector.test.ts`, `tests/metrics/reporter.test.ts`,
  `tests/discovery/logcat-parser.test.ts`, `tests/orchestrator/test-config.test.ts`.
- Adapters (`EventLoopLagSampler`, iperf shell, adb logcat) are kept thin; their decision
  outputs are what gets unit-tested. Orchestrator wiring is verified with injected fakes as
  today (`phoneDiscovery` injection precedent).

## Out of Scope

- True LAN/Wi-Fi network-limit benchmarking (throughput/airtime saturation) — explicitly
  rejected (ADR-0001/0004); would require multi-host orchestration.
- Multi-host peer distribution across real stations (ADR-0001).
- Receiver-side RTCP media loss and real congestion-controlled media / GCC realism (ADR-0004).
- RFC-3550 inter-arrival jitter (the stddev is merely relabelled).
- Phone resource attestation via dumpsys as a primary signal (noted as possible future
  complement in ADR-0005).

## Further Notes

- Calibration constants are tunables, not design: the ~50 ms event-loop p95 lag threshold,
  the peer-count ramp schedule and per-phase duration, and the link-degraded thresholds.
  Calibrate the lag threshold against the loopback baseline on the actual test laptop.
- The loopback smoke mode now has two jobs (protocol check + laptop capacity baseline); keep
  it load-comparable to star or the baseline becomes optimistic.
