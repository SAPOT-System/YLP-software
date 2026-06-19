import { isLinkHealthy, LinkHealthThresholds } from '@/metrics/link-health';
import { IperfStats } from '@/metrics/collector';

function mkIperf(overrides: Partial<IperfStats> = {}): IperfStats {
  return {
    throughputMbps: 940,
    lossPercent: 0.01,
    jitterMs: 0.1,
    lostPackets: 1,
    totalPackets: 10000,
    ...overrides,
  };
}

const CUSTOM_THRESHOLDS: LinkHealthThresholds = {
  minThroughputMbps: 10,
  maxLossPercent: 1,
  maxDegradationFactor: 0.15,
};

describe('isLinkHealthy', () => {
  // --- null baseline ---

  it('returns healthy when baseline is null (no iperf data)', () => {
    const result = isLinkHealthy(null);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.throughputMbps).toBe(0);
    expect(result.lossPercent).toBe(0);
  });

  it('returns healthy when baseline is null even with an under-load value', () => {
    const result = isLinkHealthy(null, mkIperf({ throughputMbps: 1 }));
    expect(result.healthy).toBe(true);
  });

  // --- loss check ---

  it('returns degraded when loss exceeds threshold', () => {
    const result = isLinkHealthy(mkIperf({ lossPercent: 2.5 }));
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/loss.*2\.5.*exceed/i);
  });

  it('loss at exactly the threshold is degraded', () => {
    const result = isLinkHealthy(mkIperf({ lossPercent: 1 }), null, CUSTOM_THRESHOLDS);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/loss/i);
  });

  it('loss just below the threshold is healthy', () => {
    const result = isLinkHealthy(mkIperf({ lossPercent: 0.99 }), null, CUSTOM_THRESHOLDS);
    expect(result.healthy).toBe(true);
  });

  it('loss check takes priority over throughput/ratio checks', () => {
    const result = isLinkHealthy(mkIperf({ lossPercent: 5, throughputMbps: 1 }), null, CUSTOM_THRESHOLDS);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/loss/i);
  });

  // --- no under-load: absolute floor on baseline ---

  it('returns healthy for a good baseline with no under-load', () => {
    const result = isLinkHealthy(mkIperf());
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.throughputMbps).toBe(940);
    expect(result.lossPercent).toBe(0.01);
  });

  it('null under-load: baseline below floor is degraded', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 1.5 }));
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/throughput.*1\.5.*threshold/i);
  });

  it('null under-load: baseline at the floor is degraded', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 2 }));
    expect(result.healthy).toBe(false);
  });

  it('null under-load: baseline above floor is healthy', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 3 }));
    expect(result.healthy).toBe(true);
  });

  it('null under-load with custom threshold: below threshold is degraded', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 5 }), null, CUSTOM_THRESHOLDS);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/throughput.*5.*threshold/i);
  });

  it('null under-load with custom threshold: at threshold is degraded', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 10 }), null, CUSTOM_THRESHOLDS);
    expect(result.healthy).toBe(false);
  });

  it('null under-load with custom threshold: above threshold is healthy', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 10.1 }), null, CUSTOM_THRESHOLDS);
    expect(result.healthy).toBe(true);
  });

  // --- with under-load: relative degradation ---

  it('AC: baseline 8 Mbps, under-load 8 Mbps → healthy (no ratio degradation)', () => {
    const base = mkIperf({ throughputMbps: 8 });
    const load = mkIperf({ throughputMbps: 8 });
    const result = isLinkHealthy(base, load);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('AC: baseline 8 Mbps, under-load 6.7 Mbps (>15% drop) → degraded with ratio reason', () => {
    const base = mkIperf({ throughputMbps: 8 });
    const load = mkIperf({ throughputMbps: 6.7 });
    const result = isLinkHealthy(base, load);
    expect(result.healthy).toBe(false);
    // (8 - 6.7) / 8 = 16.25% > 15%
    expect(result.reason).toMatch(/16%.*below.*baseline/i);
  });

  it('AC: under-load below 2 Mbps → degraded regardless of ratio', () => {
    // ratio drop is only 12% but still fails the absolute floor
    const base = mkIperf({ throughputMbps: 2.2 });
    const load = mkIperf({ throughputMbps: 1.9 });
    const result = isLinkHealthy(base, load);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/floor|below/i);
  });

  it('under-load just above 2 Mbps floor but within ratio → healthy', () => {
    const base = mkIperf({ throughputMbps: 8 });
    const load = mkIperf({ throughputMbps: 7 }); // 12.5% drop < 15%
    const result = isLinkHealthy(base, load);
    expect(result.healthy).toBe(true);
  });

  it('under-load at exactly 2 Mbps floor → degraded', () => {
    const base = mkIperf({ throughputMbps: 8 });
    const load = mkIperf({ throughputMbps: 2 });
    const result = isLinkHealthy(base, load);
    expect(result.healthy).toBe(false);
  });

  // --- result fields ---

  it('includes the baseline values in the result for the healthy case', () => {
    const result = isLinkHealthy(mkIperf({ throughputMbps: 3, lossPercent: 0.2 }));
    expect(result.throughputMbps).toBe(3);
    expect(result.lossPercent).toBe(0.2);
  });

  it('reports baseline throughput in result even when degraded by under-load ratio', () => {
    const base = mkIperf({ throughputMbps: 8 });
    const load = mkIperf({ throughputMbps: 6 }); // 25% drop → degraded
    const result = isLinkHealthy(base, load);
    expect(result.throughputMbps).toBe(8);
  });

  it('respects custom thresholds with under-load', () => {
    const thresholds: LinkHealthThresholds = {
      minThroughputMbps: 5,
      maxLossPercent: 0.5,
      maxDegradationFactor: 0.10,
    };
    const base = mkIperf({ throughputMbps: 100 });
    const load = mkIperf({ throughputMbps: 88 }); // 12% drop > 10% threshold
    const result = isLinkHealthy(base, load, thresholds);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/12%.*below.*baseline/i);
  });
});
