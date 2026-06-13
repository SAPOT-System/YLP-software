# PRD: Align tcp-signaled to a real local-network test (star-vs-phone)

Status: ready-for-agent · Date: 2026-06-13

Related: ADR [0001](../../adr/0001-canonical-local-network-test-star-vs-phone.md),
ADR [0002](../../adr/0002-phone-discovery-via-adb-logcat.md),
prior plan [2026-06-12-webrtc-real-network-signaling.md](./2026-06-12-webrtc-real-network-signaling.md).

Implementation issues: see [`docs/issues/lnt-1`..`lnt-6`](../../issues/).

---

## Problem Statement

As someone who needs to know how the Sapot phone app behaves on a real local network, I
can't currently get a trustworthy answer from the stress test. Several modes claim to test
the "local network" but none actually do:

- `tcp-signaled` pair mode runs simulated peers over **loopback (127.0.0.1)** — traffic
  never crosses the WiFi, mDNS discovery is never exercised, and both ends run
  libdatachannel, so the WebRTC numbers don't transfer to a real phone.
- `lan` mode does cross the network and uses mDNS, but it's a plain TCP echo test with **no
  WebRTC** at all.
- `ws-signaled` is filed under "local network" but actually stresses the FastAPI **server**,
  not the LAN.

On top of that, the one mode that can engage a real phone (`tcp-signaled` star) requires
hand-entering the phone's IP, port, and userId — and the app's TCP port is randomly
generated every launch, so the static config goes stale constantly.

## Solution

Make **one canonical local-network test** that is honest about what it measures: N
simulated peers on a laptop engaging a **real phone over WiFi** (star topology), exercising
the app's real discovery (mDNS) front door and its real `react-native-webrtc` stack.

The operator just attaches the phone over adb and runs the test — the phone's IP, port, and
userId are auto-discovered by scraping `adb logcat`. Discovery is measured from the laptop
by counting the phone's own liveness-probe connections. Modes that aren't local-network
tests (server relay, loopback smoke) are relabelled so results are never misread.

## User Stories

1. As a stress-test operator, I want a single clearly-named "local network test", so that I
   know which mode answers "how many peers can the phone handle on WiFi".
2. As an operator, I want N simulated peers to advertise themselves via mDNS, so that the
   phone's real discovery path is loaded the same way real devices load it.
3. As an operator, I want the test to report how many of my N peers the phone actually
   discovered, so that I can see where discovery starts dropping peers.
4. As an operator, I want a discovery-latency figure (advertise → phone first contact), so
   that I can see how discovery slows as peer count grows.
5. As an operator, I want simulated peers to form real WebRTC sessions with the phone, so
   that establishment/ICE timings reflect the phone's actual `react-native-webrtc` stack.
6. As an operator, I want to drive N concurrent sessions deterministically (peers dial the
   phone), so that I control the load rather than relying on a user tapping each peer.
7. As an operator, I want the phone's IP and TCP port auto-discovered over adb, so that I
   don't hand-enter values that go stale every app launch.
8. As an operator, I want the phone's userId auto-discovered too, so that signaling routing
   works without me looking up an account id.
9. As an operator running a preview build for testing, I want the phone to expose its userId
   in logcat, so that adb discovery works end-to-end on the build I actually sideload.
10. As a security-conscious maintainer, I want the userId log suppressed in production
    builds, so that a user identifier never leaks to logcat in the shipped app.
11. As an operator, I want a report banner clarifying that peer-side WebRTC runs on
    libdatachannel, so that I don't over-trust absolute peer-side latency numbers.
12. As an operator, I want discovery and concurrent-session-count metrics treated as
    phone-real, so that I know which numbers do reflect the device under test.
13. As an operator, I want `ws-signaled` clearly labelled a server-signaling test, so that I
    don't mistake server-relay results for local-network behaviour.
14. As an operator, I want loopback `tcp-signaled` pair mode labelled a protocol/CPU smoke
    test, so that I don't read a single-laptop CPU result as a network result.
15. As a CI maintainer, I want loopback pair mode to keep working without a phone, so that
    fast no-hardware correctness checks still run.
16. As an operator, I want the README's "which test should I run" guidance updated, so that
    the canonical local-network test is the obvious choice for LAN questions.
17. As a maintainer, I want the design decisions captured as ADRs, so that future readers
    understand why it's star-vs-phone and why discovery uses adb log scraping.
18. As an operator, I want a clear error when discovery can't find the phone (no adb device,
    production build, log line missing), so that I can fix setup instead of guessing.

## Implementation Decisions

- **Canonical topology: star-vs-phone over WiFi** (ADR 0001). One laptop, N simulated
  peers, one real phone as passive system under test. No multi-host/distributed
  orchestration is built.
- **mDNS advertise on the canonical peer.** The mDNS advertisement mechanism currently in
  the `LanPeer` (the `_lanchat._tcp` service with the peer's identity TXT records) is
  brought into the canonical signaled peer so the phone discovers each simulated peer.
- **Discovery and session are decoupled.** Being discovered does not start a session (the
  app only lists discovered peers; it dials on user action). The canonical peer therefore
  both advertises (for discovery load) and dials the phone (to drive sessions
  deterministically, peer as offerer in app-native signaling format).
- **Discovery measured via inbound liveness probe.** The phone's discovery sweep opens a
  bare TCP connection (no NaCl handshake) to each discovered peer. The peer distinguishes a
  probe (bare connect, no handshake) from a real session dial and records it. Metrics:
  discovery completeness (peers probed / N) and discovery latency (advertise → first probe).
- **adb auto-discovery replaces static phone config** (ADR 0002). A discovery step scrapes
  `adb logcat` for the phone's WiFi IP, TCP port, and userId, replacing the
  `phoneIp` / `phonePort` / `phoneUserId` config fields. The app's port is random per
  launch, so it must be read from the log, not assumed.
- **App emits userId to a log line, gated by build variant.** The userId is added to a log
  line present only when `APP_VARIANT` is `development` or `preview` and stripped in
  production, using the existing variant mechanism exposed at runtime via `expoConfig.extra`.
- **Reporting honesty.** Reports carry a representativeness note that peer-side WebRTC is
  libdatachannel (not phone-representative), while discovery and concurrent-session counts
  are phone-real. `ws-signaled` is relabelled a server-signaling test and removed from
  local-network framing; loopback pair mode is labelled a protocol/CPU smoke test.
- **No new transport contracts.** The signaling wire formats (app-native `SignalingMessage`
  for star, server format for ws) are unchanged; this work adds discovery + measurement +
  labelling, not a new protocol.

## Testing Decisions

- **Test external behaviour, not internals.** Tests assert observable outcomes — a peer
  advertises a discoverable service, a peer counts an inbound bare-TCP probe as a discovery
  event, the adb-discovery parser extracts the right IP/port/userId from sample log text,
  the reporter emits the right labels — not private fields or call sequences.
- **Prior art:** existing peer tests (e.g. the `tcp-signaled` peer test that stands up a
  real TCP server on an ephemeral port and connects over loopback) and the metrics
  collector / reporter tests. New tests follow the same Arrange-Act-Assert shape and the
  same "real socket on 127.0.0.1" approach.
- **Modules tested:** the canonical signaled peer (mDNS advertise + probe detection), the
  adb log-scraping parser (pure function over sample log strings — no live device needed),
  the metrics collector (discovery completeness/latency aggregation), and the reporter
  (labels + representativeness banner + discovery section).
- **The app-side userId log change** is verified by a unit test asserting the line is
  emitted for `development`/`preview` variants and absent for production.
- **Hardware-dependent paths** (a real phone discovering real peers over WiFi) are validated
  manually with a documented runbook, not in automated CI; the laptop-side parsing and
  metric logic are fully unit-tested with synthetic inputs.

## Out of Scope

- Multi-host / distributed peer-to-peer saturation across several laptops (ADR 0001).
- Real codec/encoder media (synthetic RTP remains).
- iOS discovery (adb is Android-only; this targets the existing Android phone-test setup).
- Changing the WebRTC signaling wire formats or the NaCl encryption scheme.
- Perfect-negotiation/glare, ICE-restart, and credential/peer-key parity with the app.

## Further Notes

- Reconcile with the existing plan `2026-06-12-webrtc-real-network-signaling.md` during
  implementation planning.
- A glossary (`CONTEXT.md`) was drafted during design but not committed; terms used here
  (simulated peer, system under test, star topology, discovery sweep, session formation)
  should be captured there during implementation.
