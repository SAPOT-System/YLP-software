import { emptyMetrics } from '@/peers/base-peer';

describe('emptyMetrics', () => {
  it('includes WebRTC fields with zero/empty defaults', () => {
    const m = emptyMetrics();
    expect(m.iceEstablishMs).toEqual([]);
    expect(m.connectionTimeouts).toBe(0);
    expect(m.rtpPacketsSent).toBe(0);
    expect(m.rtpPacketsLost).toBe(0);
    expect(m.dcEstablishMs).toEqual([]);
    expect(m.iceStateTransitions).toEqual([]);
    expect(m.audioEstablishMs).toEqual([]);
    expect(m.videoEstablishMs).toEqual([]);
    expect(m.connectedAtPhaseEnd).toBe(false);
  });

  it('does not include removed fields', () => {
    const m = emptyMetrics();
    expect('mediaEstablishMs' in m).toBe(false);
    expect('wsPeakQueueFills' in m).toBe(false);
  });
});
