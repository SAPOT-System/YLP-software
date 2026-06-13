import { buildRtpPacket } from '@/peers/rtp-utils';

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
