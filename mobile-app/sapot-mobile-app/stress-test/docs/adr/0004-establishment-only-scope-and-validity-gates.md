# 4. The ceiling is establishment integrity only; throughput and loss are demoted to gates

Date: 2026-06-18

## Status

Accepted

## Context

ADR-0001 set the goal — the session ceiling against one phone over one access point — but
left the metric framing implicit, and the tool still reported network-style numbers
(throughput, packet loss) as if it measured the network. A review found those numbers were
not network-grounded: "packet loss" came from sender-side send-queue failures, the
`packetLossPercent` figure was derived from host TCP retransmits that never carry the
WebRTC traffic, and synthetic media has no congestion control so media-quality numbers are
meaningless. Chasing real network limits would mean reversing ADR-0001 (multi-host), which
we declined.

We therefore re-scoped the tool to measure **only what it can measure faithfully**:
whether sessions form cleanly, and at what peer count that breaks.

## Decision

The session ceiling is defined by **establishment integrity alone**.

- **Ceiling rule:** the highest peer count where ICE-connected success rate ≥ 95% **on a
  lag-valid phase** (see ADR-0003). The first lag-valid phase below 95% is over the ceiling.
  ICE-establish p95 and timeout rate are reported as secondary early-warning, not as the cut.
- **Throughput/loss are demoted to validity gates, not outputs.** Two gates bracket the
  measurement so the ceiling is attributable to the phone:
  - *laptop gate* — loopback control + event-loop lag (ADR-0003)
  - *link gate* — a pre-run iperf baseline confirming the AP/link is healthy; a run is
    flagged if the link is degraded. iperf throughput/loss is removed from per-phase ceiling
    metrics and from saturation analysis.
- **Misleading metrics removed/renamed:** the tcpRetrans-derived `packetLossPercent` is
  deleted; the send-queue `dropped` counter is renamed `txQueueOverflow` (it is backpressure,
  not network loss); the RTP-loss metric is deleted with media demoted to load-only.
- **Media is load, not output.** Canonical runs use audio-video calls for phone-side realism,
  but no media-quality metric is reported. Receiver-side RTCP loss and real congestion
  control are explicitly out of scope.
- Data-channel RTT (p50/p95/p99) and its stddev may be reported as informational secondary
  signals; the stddev is labelled "RTT stddev," not jitter.

## Consequences

- The tool answers one question well instead of several questions badly. No output claims to
  measure the network.
- Every ceiling carries two implicit guarantees (laptop had headroom; link was healthy), so a
  degraded result points at the phone.
- If true network-limit benchmarking is ever needed, it remains a separate effort that would
  supersede ADR-0001, not a tweak to this tool.

## Alternatives considered

- **Keep throughput/loss as headline metrics** — rejected: re-imports the rejected
  network-limit goal and keeps numbers the review flagged as not network-grounded.
- **Latency-knee or composite ceiling rule** — rejected in favour of a single success-rate
  cut-line for reproducibility; the other signals are kept as early-warning only.
