# 0009 — Zombie connection guard

Labels: `ready-for-agent`
PRD: PRD-tcp-star-accuracy.md
Type: AFK
Depends on: none

## What to build

A peer whose ICE negotiation completes *after* the laptop's connection timeout has fired is
a zombie — the laptop already gave up on it. Currently such peers inflate `connectedPeers`
and their missing ICE timing drives `iceEstablishP50Ms` to 0. Fix this by moving
`connectedAtPhaseEnd = true` inside the pre-timeout success path. The raw
RTCPeerConnection state-change handler must no longer write `connectedAtPhaseEnd`.

The change is in the tcp-signaled peer implementation. Apply the same fix to the ws-signaled
peer if it has the same structure.

## Acceptance criteria

- [ ] A peer that reaches RTCPeerConnection 'connected' state *after* its timeout has fired
  has `connectedAtPhaseEnd: false` and contributes no entry to `iceEstablishMs`.
- [ ] A peer that reaches 'connected' state *before* its timeout has fired has
  `connectedAtPhaseEnd: true` and its elapsed time recorded in `iceEstablishMs`.
- [ ] The 20-peer star result no longer shows `connectedPeers: 3` with
  `iceEstablishP50Ms: 0` (zombie split eliminated).
- [ ] Unit test: peer-with-late-ICE fixture → `connectedAtPhaseEnd: false`, empty
  `iceEstablishMs`.
- [ ] `npm run build` passes; existing suites green.

## Blocked by

None — can start immediately.
