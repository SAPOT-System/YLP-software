# Stress Test

A load tester that drives many simulated peers against the real Sapot phone app to find
the point at which the phone (over one access point) can no longer form sessions cleanly.

## Language

**Session ceiling**:
The canonical result of this tool: the number of simulated peers at which the phone, over
one access point, stops forming sessions cleanly. The benchmark's single product question.
_Avoid_: network limit, LAN limit, throughput limit (those imply phone-less network
saturation, which this tool deliberately does not measure — see ADR-0001).

**Establishment integrity**:
The chosen degradation signal that defines the session ceiling — ICE-connected success
rate, ICE-establish latency, and connection-timeout rate as peer count climbs. Degradation
here, not media or throughput, declares the ceiling has been reached.
_Avoid_: connection health, stability.

**Simulated peer**:
One laptop-side fake caller (libdatachannel `RTCPeerConnection`) that engages the phone.
The peer side of a session is never a real device.
_Avoid_: client, node, fake user.

**Phone (system under test)**:
The single real device running the real `react-native-webrtc` stack. The passive target
every simulated peer converges on. The only real-device side of any session.
_Avoid_: server, endpoint, target.

**Star test**:
The canonical configuration: N simulated peers on one laptop all engaging one phone across
the access point (real traffic on the wire).
_Avoid_: phone mode, real-network test.

**Loopback smoke test**:
The no-phone pair configuration over `127.0.0.1`, retained only as a CI/protocol check. It
is explicitly not a session-ceiling result.
_Avoid_: LAN test, pair test as a network result.

**phone-refused**:
A session the phone explicitly rejected — signalled by a `session › rejected` log event from
the phone. The offer arrived and was actively turned away.
_Avoid_: dropped, failed, error.

**arrived-but-stalled**:
A session whose offer reached the phone's WebRTC stack (phone logged `session › accepted`)
but whose ICE negotiation never completed before the laptop's connection timeout fired.
Distinct from never-arrived: the phone saw it but could not finish it.
_Avoid_: partial connection, ICE failure (too broad — ICE failure can also mean never-arrived).

**never-arrived**:
A connection timeout on the laptop side with no matching `session › accepted` on the phone —
the offer was sent but never triggered WebRTC processing on the phone.
_Avoid_: dropped (ambiguous — doesn't distinguish phone-refused from transport loss).

**mediaInSdp**:
A per-peer flag recording whether at least one media track (`Audio`/`Video`) was successfully
added to the `RTCPeerConnection` before the offer was generated. True means the SDP carries
a media section (replicating a real call's ICE negotiation load). It does not mean RTP
packets were sent — RTP delivery is tracked separately by `rtpPacketsSent`.
_Avoid_: media connected, media supported (both imply packets flowing, which this does not).
