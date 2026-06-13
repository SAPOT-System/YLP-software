# fix(stress-test): update all four peer call sites for new video RTP API

## Parent

[#128 — fix(stress-test): realistic RTP payload sizing for audio and video media plane](https://github.com/Emman-pip/YLP-software/issues/128)

## What to build

Four peer classes share the same video send loop pattern and all call `buildVideoRtpPacket` with the old `payloadBytes` signature. Update each to pass `frameIndex` instead, which is what unlocks the keyframe simulation added in [128-2](./128-2-video-rtp-keyframes.md).

Each peer needs a `videoFrameIndex` counter (initialised to 0, incremented each interval tick) passed as the final argument to `buildVideoRtpPacket`. The `payloadBytes` pre-computation (`bytesPerFrame`) becomes `avgBytesPerFrame` passed directly — the function now owns the I/P sizing logic.

Files to update:
- `src/peers/webrtc-peer.ts`
- `src/peers/ws-signaled-wrtc-peer.ts`
- `src/peers/ws-star-peer.ts`
- `src/peers/tcp-signaled-wrtc-peer.ts`

## Acceptance criteria

- [ ] All four peer files pass `videoFrameIndex` to `buildVideoRtpPacket`
- [ ] `videoFrameIndex` increments on every video timer tick in each peer
- [ ] No peer file pre-computes a per-frame byte size using I/P logic — that belongs in `rtp-utils.ts`
- [ ] `npm run build` passes (no TypeScript errors across all peer files)
- [ ] `npm test` passes

## Blocked by

[128-2 — video RTP payload keyframe simulation](./128-2-video-rtp-keyframes.md) (requires the new `buildVideoRtpPacket` signature).
