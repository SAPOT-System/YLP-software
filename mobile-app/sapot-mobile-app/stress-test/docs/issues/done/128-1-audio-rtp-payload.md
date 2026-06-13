# fix(stress-test): audio RTP payload — 3 bytes → 32 bytes

## Parent

[#128 — fix(stress-test): realistic RTP payload sizing for audio and video media plane](https://github.com/Emman-pip/YLP-software/issues/128)

## What to build

Fix `buildRtpPacket` in `src/peers/rtp-utils.ts` to send a 32-byte payload instead of the current 3-byte zero buffer. A real Opus voiced frame at 16 kbps / 20 ms is ~32 bytes, so this single change closes the ~12× audio bandwidth underestimation without touching any call sites (the function signature is unchanged).

Add a new test file `tests/peers/rtp-utils.test.ts` with assertions covering the audio packet: total buffer length, RTP header fields (version bits, payload type 111, sequence number, timestamp, SSRC).

## Acceptance criteria

- [ ] `buildRtpPacket` returns a buffer of exactly 44 bytes (12-byte RTP header + 32-byte payload)
- [ ] RTP header byte 0 is `0x80` (version=2, no padding, no extension, CC=0)
- [ ] Payload type field is 111
- [ ] Sequence number, timestamp, and SSRC are written correctly into the header
- [ ] All existing callers (`webrtc-peer.ts`, `ws-signaled-wrtc-peer.ts`, `ws-star-peer.ts`, `tcp-signaled-wrtc-peer.ts`) continue to compile with no changes
- [ ] `npm test` passes

## Blocked by

None — can start immediately.
