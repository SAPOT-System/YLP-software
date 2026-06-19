# 0012 — `mediaInSdp` flag

Labels: `ready-for-agent`
PRD: PRD-tcp-star-accuracy.md
Type: AFK
Depends on: none

## What to build

Add `mediaInSdp: boolean` to record whether at least one `addTrack` call succeeded before
the offer was generated. Each peer sets the flag inside the try/catch success path. The
collector aggregates it as `true` if any peer in the phase reported it. The reporter prints
it in the WebRTC block with a one-line note that `rtpPacketsSent: 0` is expected when
`mediaInSdp: true` because both sides are SendOnly.

## Acceptance criteria

- [ ] `mediaInSdp: boolean` in `PhaseStats` and result JSON.
- [ ] Reporter WebRTC block prints `mediaInSdp` and the SendOnly note.
- [ ] `addTrack` swallowed by try/catch → `mediaInSdp: false`.
- [ ] At least one peer succeeds → `mediaInSdp: true`.
- [ ] Unit test: one success → `true`; all failures → `false`.
- [ ] `npm run build` passes; existing suites green.

## Blocked by

None — can start immediately.
