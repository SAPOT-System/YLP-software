import { isLinkHealthy, LinkHealthThresholds } from '@/metrics/link-health';
import { IperfStats } from '@/metrics/collector';

function baseline(overrides: Partial<IperfStats> = {}): IperfStats {
  return {
    throughputMbps: 940,
    lossPercent: 0.01,
    jitterMs: 0.1,
    lostPackets: 1,
    totalPackets: 10000,
    ...overrides,
  };
}

describe('isLinkHealthy', () => {
  it('returns healthy when baseline is null (no iperf data)', () => {
    const result = isLinkHealthy(null);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.throughputMbps).toBe(0);
    expect(result.lossPercent).toBe(0);
  });

  it('returns healthy for a good baseline', () => {
    const result = isLinkHealthy(baseline());
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.throughputMbps).toBe(940);
    expect(result.lossPercent).toBe(0.01);
  });

  it('returns degraded when loss exceeds threshold', () => {
    const result = isLinkHealthy(baseline({ lossPercent: 2.5 }));
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/loss.*2\.5.*exceed/i);
  });

  it('returns degraded when throughput is below threshold', () => {
    const result = isLinkHealthy(baseline({ throughputMbps: 5 }));
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/throughput.*5.*below/i);
  });

  it('loss check takes priority over throughput check', () => {
    const result = isLinkHealthy(baseline({ lossPercent: 5, throughputMbps: 1 }));
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/loss/i);
  });

  it('loss at exactly the threshold is degraded (strictly >)', () => {
    const result = isLinkHealthy(baseline({ lossPercent: 1 }), { minThroughputMbps: 10, maxLossPercent: 1 });
    expect(result.healthy).toBe(false);
  });

  it('loss just below the threshold is healthy', () => {
    const result = isLinkHealthy(baseline({ lossPercent: 0.99 }), { minThroughputMbps: 10, maxLossPercent: 1 });
    expect(result.healthy).toBe(true);
  });

  it('throughput at exactly the threshold is degraded (strictly <)', () => {
    const result = isLinkHealthy(baseline({ throughputMbps: 10 }), { minThroughputMbps: 10, maxLossPercent: 1 });
    expect(result.healthy).toBe(false);
  });

  it('throughput just above the threshold is healthy', () => {
    const result = isLinkHealthy(baseline({ throughputMbps: 10.1 }), { minThroughputMbps: 10, maxLossPercent: 1 });
    expect(result.healthy).toBe(true);
  });

  it('respects custom thresholds', () => {
    const custom: LinkHealthThresholds = { minThroughputMbps: 100, maxLossPercent: 0.5 };
    const result = isLinkHealthy(baseline({ throughputMbps: 50, lossPercent: 0.3 }), custom);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/throughput/i);
  });

  it('includes the measured values in the result regardless of verdict', () => {
    const result = isLinkHealthy(baseline({ throughputMbps: 3, lossPercent: 0.2 }));
    expect(result.throughputMbps).toBe(3);
    expect(result.lossPercent).toBe(0.2);
  });
});
