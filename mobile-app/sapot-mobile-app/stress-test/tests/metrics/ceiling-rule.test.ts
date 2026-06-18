import { determineCeiling } from '@/metrics/ceiling-rule';
import { PhaseStats } from '@/metrics/collector';

const BASE: PhaseStats = {
  phaseName: 'phase', peerCount: 4, msgPerSec: 5, durationSec: 30,
  totalSent: 0, totalAcked: 0, deliveryRate: 0, txQueueOverflowCount: 0,
  p50Ms: 0, p95Ms: 0, p99Ms: 0, rttStddevMs: 0, connectionErrors: 0,
  throughputMbps: 0, rssiDbm: null, linkSpeedMbps: null,
  iperfBaseline: null, iperfLoad: null,
  iceEstablishP50Ms: 0, iceEstablishP95Ms: 0, iceEstablishMaxMs: 0,
  connectionTimeouts: 0, rtpPacketsSent: 0, audioEstablishP95Ms: 0,
  videoEstablishP95Ms: 0, dcEstablishP95Ms: 0, connectedPeers: 4,
  discoveryCompleteness: 0, discoveryP50Ms: 0, discoveryP95Ms: 0,
  lagP95Ms: 0, lagValid: true,
};

function phase(overrides: Partial<PhaseStats>): PhaseStats {
  return { ...BASE, ...overrides };
}

describe('determineCeiling', () => {
  it('returns belowRange when given no phases', () => {
    const result = determineCeiling([]);
    expect(result.belowRange).toBe(true);
    expect(result.ceilingPeerCount).toBe(0);
    expect(result.validPhaseCount).toBe(0);
  });

  it('ignores all phases when all are lag-invalid', () => {
    const result = determineCeiling([
      phase({ peerCount: 4, connectedPeers: 4, lagValid: false }),
      phase({ peerCount: 8, connectedPeers: 8, lagValid: false }),
    ]);
    expect(result.belowRange).toBe(true);
    expect(result.ceilingPeerCount).toBe(0);
    expect(result.validPhaseCount).toBe(0);
  });

  it('monotonic degradation: ceiling is the last passing peer count', () => {
    const result = determineCeiling([
      phase({ phaseName: 'p2',  peerCount: 2,  connectedPeers: 2  }),
      phase({ phaseName: 'p4',  peerCount: 4,  connectedPeers: 4  }),
      phase({ phaseName: 'p8',  peerCount: 8,  connectedPeers: 7  }),  // 87.5% — below 95%
      phase({ phaseName: 'p16', peerCount: 16, connectedPeers: 12 }),  // 75%
    ]);
    expect(result.ceilingPeerCount).toBe(4);
    expect(result.openEnded).toBe(false);
    expect(result.belowRange).toBe(false);
    expect(result.validPhaseCount).toBe(4);
  });

  it('threshold boundary: exactly 95% counts as passing (inclusive ≥)', () => {
    // 20 peers, 19 connected = 95.0% exactly
    const result = determineCeiling([
      phase({ peerCount: 20, connectedPeers: 19 }),
    ]);
    expect(result.ceilingPeerCount).toBe(20);
    expect(result.belowRange).toBe(false);
  });

  it('degrades-immediately: no lag-valid phase meets the threshold', () => {
    const result = determineCeiling([
      phase({ peerCount: 4, connectedPeers: 3 }),  // 75%
      phase({ peerCount: 8, connectedPeers: 5 }),  // 62.5%
    ]);
    expect(result.belowRange).toBe(true);
    expect(result.ceilingPeerCount).toBe(0);
    expect(result.validPhaseCount).toBe(2);
  });

  it('never-degrades: all lag-valid phases pass → openEnded=true at max peer count', () => {
    const result = determineCeiling([
      phase({ peerCount: 2,  connectedPeers: 2  }),
      phase({ peerCount: 4,  connectedPeers: 4  }),
      phase({ peerCount: 8,  connectedPeers: 8  }),
    ]);
    expect(result.ceilingPeerCount).toBe(8);
    expect(result.openEnded).toBe(true);
    expect(result.belowRange).toBe(false);
  });

  it('lag-invalid phase straddling the knee is excluded', () => {
    // Valid phases: 4 (passes), 16 (fails). Lag-invalid: 8 (would pass but excluded).
    const result = determineCeiling([
      phase({ peerCount: 4,  connectedPeers: 4,  lagValid: true  }),
      phase({ peerCount: 8,  connectedPeers: 8,  lagValid: false }),  // excluded
      phase({ peerCount: 16, connectedPeers: 12, lagValid: true  }),  // 75% — fails
    ]);
    expect(result.ceilingPeerCount).toBe(4);
    expect(result.openEnded).toBe(false);
    expect(result.validPhaseCount).toBe(2);
  });

  it('respects a custom successThreshold', () => {
    // threshold=0.8: 75% fails, 80% passes exactly
    const result = determineCeiling([
      phase({ peerCount: 4, connectedPeers: 3 }),  // 75% — fails at 0.8
      phase({ peerCount: 8, connectedPeers: 8 }),  // 100% — passes
    ], { successThreshold: 0.8 });
    expect(result.ceilingPeerCount).toBe(8);
    expect(result.openEnded).toBe(true);
  });

  it('excludes phases with peerCount=0 from success calculation', () => {
    const result = determineCeiling([
      phase({ peerCount: 0, connectedPeers: 0 }),
      phase({ peerCount: 4, connectedPeers: 4 }),
    ]);
    // peerCount=0 phase → successRate=0 → fails; peerCount=4 phase passes
    expect(result.ceilingPeerCount).toBe(4);
  });
});
