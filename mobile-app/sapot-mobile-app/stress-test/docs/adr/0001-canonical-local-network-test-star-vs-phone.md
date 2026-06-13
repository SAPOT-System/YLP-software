# 1. Canonical local-network test is star-vs-phone, not multi-host

Date: 2026-06-13

## Status

Accepted

## Context

The stress test had several modes claiming to exercise the "local network", but none
actually did so faithfully:

- `tcp-signaled` pair mode wires simulated peers to each other over **loopback
  (127.0.0.1)**. Traffic never crosses the WiFi/AP, so it measures one laptop's CPU and
  the libdatachannel↔libdatachannel path — not the local network and not the phone.
- `lan` mode does cross the network and uses mDNS, but it is a plain TCP echo test with
  **no WebRTC**.
- `ws-signaled` routes signaling through the FastAPI relay; the thing under load is the
  server, not the LAN.

We need a single, well-defined "local network test" whose results are meaningful for the
real product question: *how many simulated peers can engage the Sapot phone app over the
same WiFi before discovery or session formation degrades?*

Two designs could put real traffic on the wire:

1. **Star vs real phone over WiFi** — one laptop runs N simulated peers that all engage a
   single real phone through the access point. The phone (running real
   `react-native-webrtc`) is the system under test.
2. **Multi-host peer-to-peer** — simulated peers spread across multiple physical laptops
   on the same WiFi, talking to each other with no phone. This requires new distributed
   orchestration: cross-machine coordination, clock alignment, and result aggregation.

## Decision

The **canonical local network test is star-vs-phone over WiFi**. One laptop drives N
simulated peers against one real phone across the AP. The phone is the passive system
under test and supplies the real WebRTC stack on its side of every session.

We will **not** build multi-host peer-to-peer orchestration.

Loopback `tcp-signaled` **pair** mode is retained only as a no-phone CI/protocol smoke
check and is labelled as such — it is explicitly not a local-network result.

## Consequences

- Establishment/ICE metrics now reflect a real simulated-peer ↔ phone negotiation, so they
  are phone-involving rather than libdatachannel-only.
- The realistic product ceiling we measure is "how many callers can one phone/AP sustain",
  which matches actual deployment (devices converging on one phone over shared WiFi).
- We do **not** measure phone-less WiFi saturation across many machines. If that question
  ever becomes important, it is a separate, larger effort and would supersede this ADR.
- The test now depends on a real phone reachable over WiFi and on adb (see
  [0002](./0002-phone-discovery-via-adb-logcat.md) for how the phone is located).
- Simulated peers still run libdatachannel, so the *peer side* of a session is not a real
  device; reports note this where peer-side numbers are reported in isolation.

## Alternatives considered

- **Multi-host peer-to-peer saturation** — rejected for now: large distributed-systems
  cost (coordination, aggregation, clock sync) for a question that is not the current
  priority.
- **Keep loopback pair mode as the "LAN" test** — rejected: it never touches the network
  and its WebRTC numbers come from libdatachannel on both ends, so they do not transfer to
  real devices.
