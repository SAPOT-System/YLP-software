# 3. Star results are valid only when the laptop is not the bottleneck

Date: 2026-06-18

## Status

Accepted

## Context

The canonical star test (ADR-0001) reports a **session ceiling** — the peer count at
which **establishment integrity** degrades (ICE-connected success rate / establish latency
/ timeout rate). One laptop drives all N simulated peers, so every DTLS/STUN handshake runs
through a single Node event loop and one NIC. If the laptop saturates before the phone/AP
does, the "phone ceiling" is actually the laptop's ceiling and the number is meaningless.

We considered three controls: an event-loop-lag guard only, resource attestation left to
the operator, and a no-phone loopback control run. We chose to combine a loopback control
with a lag guard — but the two can disagree, and loopback under-represents real cost:

- In loopback **pair** mode both ends of every session run on the laptop, ICE completes
  over `127.0.0.1` in microseconds, and signaling never touches the server. A loopback PC
  is far cheaper than a star PC (real over-the-air DTLS, STUN keepalives, optional 50 pkt/s
  RTP). So a loopback control is **optimistic** about laptop capacity and can bless a star
  phase that was in fact host-bound.

## Decision

A star phase's result is **valid only if the in-situ event-loop lag stayed under threshold
during that phase**. The lag guard is authoritative and excludes contaminated phases from
the session-ceiling determination.

The loopback control run is demoted to a **one-time sanity baseline**, not a per-phase
gate. To keep that baseline from being wildly optimistic, loopback peers must do the **same
DTLS + media work** as star peers.

When the loopback control and the lag guard disagree, the **lag guard wins**.

Starting lag threshold: flag a phase when event-loop p95 lag exceeds ~50 ms; this is a
calibration default, not a constant — tune it against the loopback baseline on the actual
test laptop before trusting absolute ceiling numbers.

## Consequences

- Every reported session ceiling carries an implicit "laptop had headroom" guarantee; phases
  that fail the lag gate are excluded rather than silently averaged in.
- The loopback smoke mode gains a second job (capacity baseline) and must be kept
  load-comparable to star — a coupling the loopback peers must preserve.
- Absolute ceiling numbers are only portable across laptops after the lag threshold is
  recalibrated per machine.

## Alternatives considered

- **Both must pass (AND gate)** — rejected: discards phases that were genuinely phone-bound,
  needlessly shrinking usable range.
- **Control run authoritative** — rejected: loopback under-represents per-session cost, so
  it would bless host-bound phases.
- **Resource attestation only** — rejected: no automatic invalidation; pushes a subtle
  validity judgement onto the operator every run.
