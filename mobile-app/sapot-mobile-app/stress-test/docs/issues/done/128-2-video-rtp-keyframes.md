# fix(stress-test): video RTP payload — keyframe simulation (I/P frame distinction)

## Parent

[#128 — fix(stress-test): realistic RTP payload sizing for audio and video media plane](https://github.com/Emman-pip/YLP-software/issues/128)

## What to build

Update `buildVideoRtpPacket` in `src/peers/rtp-utils.ts` to simulate realistic H.264 I/P frame traffic. Change the function signature from `(seq, timestamp, ssrc, payloadBytes)` to `(seq, timestamp, ssrc, avgBytesPerFrame, frameIndex)`. The function derives the actual payload size internally:

- I-frame (keyframe): `frameIndex % 30 === 0` → payload = `avgBytesPerFrame * 8`
- P-frame: all other frames → payload = `avgBytesPerFrame / 8`

This preserves the configured average bitrate across each 30-frame window while introducing the burst pattern real H.264 encoders produce.

Add video packet test cases to `tests/peers/rtp-utils.test.ts`:
- P-frame total size = `12 + avgBytesPerFrame / 8`
- I-frame total size = `12 + avgBytesPerFrame * 8`
- Average size across 30 consecutive frames = `12 + avgBytesPerFrame` (bitrate is preserved)

## Acceptance criteria

- [ ] `buildVideoRtpPacket` accepts `(seq, timestamp, ssrc, avgBytesPerFrame, frameIndex)`
- [ ] Frame at `frameIndex % 30 === 0` produces payload of `avgBytesPerFrame * 8` bytes
- [ ] All other frames produce payload of `avgBytesPerFrame / 8` bytes
- [ ] Average total packet size across 30 consecutive calls equals `12 + avgBytesPerFrame`
- [ ] RTP header fields (version, PT=96, seq, timestamp, SSRC) are written correctly
- [ ] `npm run build` passes (TypeScript compiles cleanly)
- [ ] `npm test` passes

## Blocked by

None — can start immediately (parallel with [128-1](./128-1-audio-rtp-payload.md)).
