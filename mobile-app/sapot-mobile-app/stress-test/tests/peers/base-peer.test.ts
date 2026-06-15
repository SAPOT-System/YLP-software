import { emptyMetrics } from '@/peers/base-peer';

describe('emptyMetrics', () => {
  it('includes WebRTC fields with zero/empty defaults', () => {
    const m = emptyMetrics();
    expect(m.iceEstablishMs).toEqual([]);
    expect(m.connectionTimeouts).toBe(0);
    expect(m.rtpPacketsSent).toBe(0);
    expect(m.rtpPacketsLost).toBe(0);
    expect(m.mediaEstablishMs).toEqual([]);
    expect(m.connectedAtPhaseEnd).toBe(false);
  });
});
