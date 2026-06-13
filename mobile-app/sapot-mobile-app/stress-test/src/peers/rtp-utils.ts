export function buildRtpPacket(seq: number, timestamp: number, ssrc: number): Buffer {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = 111;
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return Buffer.concat([header, Buffer.alloc(32, 0)]);
}

export function buildVideoRtpPacket(
  seq: number,
  timestamp: number,
  ssrc: number,
  avgBytesPerFrame: number,
  frameIndex: number,
): Buffer {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = 96; // PT=96 (H.264)
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  // I-frame every 30 frames (keyframe burst), P-frames otherwise
  const payloadBytes = frameIndex % 30 === 0
    ? avgBytesPerFrame * 8
    : Math.floor(avgBytesPerFrame / 8);
  return Buffer.concat([header, Buffer.alloc(payloadBytes, 0)]);
}
