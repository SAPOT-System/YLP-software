import { buildRtpPacket, buildVideoRtpPacket } from '@/peers/rtp-utils';

describe('buildRtpPacket (audio)', () => {
  const seq = 42;
  const timestamp = 9600;
  const ssrc = 0xdeadbeef;

  let packet: Buffer;

  beforeEach(() => {
    packet = buildRtpPacket(seq, timestamp, ssrc);
  });

  it('returns exactly 44 bytes (12-byte header + 32-byte payload)', () => {
    expect(packet.length).toBe(44);
  });

  it('sets version=2, no padding, no extension, CC=0 in byte 0 (0x80)', () => {
    expect(packet[0]).toBe(0x80);
  });

  it('sets payload type to 111', () => {
    expect(packet[1]).toBe(111);
  });

  it('writes sequence number as uint16BE at offset 2', () => {
    expect(packet.readUInt16BE(2)).toBe(seq);
  });

  it('writes timestamp as uint32BE at offset 4', () => {
    expect(packet.readUInt32BE(4)).toBe(timestamp);
  });

  it('writes SSRC as uint32BE at offset 8', () => {
    expect(packet.readUInt32BE(8)).toBe(ssrc >>> 0);
  });
});

describe('buildVideoRtpPacket (H.264 with I/P frame simulation)', () => {
  const seq = 1;
  const timestamp = 0;
  const ssrc = 0xabcd1234;
  const avgBytesPerFrame = 80;

  it('sets version=2, no padding, no extension, CC=0 in byte 0 (0x80)', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 1);
    expect(packet[0]).toBe(0x80);
  });

  it('sets payload type to 96 (H.264)', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 1);
    expect(packet[1]).toBe(96);
  });

  it('writes sequence number as uint16BE at offset 2', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 1);
    expect(packet.readUInt16BE(2)).toBe(seq);
  });

  it('writes timestamp as uint32BE at offset 4', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 1);
    expect(packet.readUInt32BE(4)).toBe(timestamp);
  });

  it('writes SSRC as uint32BE at offset 8', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 1);
    expect(packet.readUInt32BE(8)).toBe(ssrc >>> 0);
  });

  it('P-frame: total packet size = 12 + avgBytesPerFrame / 8 when frameIndex % 30 !== 0', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 1);
    expect(packet.length).toBe(12 + Math.floor(avgBytesPerFrame / 8));
  });

  it('I-frame: total packet size = 12 + avgBytesPerFrame * 8 when frameIndex % 30 === 0', () => {
    const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, 0);
    expect(packet.length).toBe(12 + avgBytesPerFrame * 8);
  });

  it('treats frameIndex 30, 60, 90 as I-frames', () => {
    for (const fi of [30, 60, 90]) {
      const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, fi);
      expect(packet.length).toBe(12 + avgBytesPerFrame * 8);
    }
  });

  it('treats frameIndex 1-29 as P-frames', () => {
    for (let fi = 1; fi < 30; fi++) {
      const packet = buildVideoRtpPacket(seq, timestamp, ssrc, avgBytesPerFrame, fi);
      expect(packet.length).toBe(12 + Math.floor(avgBytesPerFrame / 8));
    }
  });
});
