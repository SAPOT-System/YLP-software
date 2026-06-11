import { formatTable, computeNetworkStats } from '@/metrics/reporter';
import { NetworkSample } from '@/metrics/network-sampler';
import { PhaseStats } from '@/metrics/collector';

const fakePhase: PhaseStats = {
  phaseName: 'peer-ramp-5', peerCount: 5, msgPerSec: 5, durationSec: 60,
  totalSent: 1500, totalAcked: 1490, deliveryRate: 0.9933, droppedCount: 10,
  p50Ms: 12, p95Ms: 35, p99Ms: 80, jitterMs: 8, connectionErrors: 0, wsPeakQueueFills: 0,
};

describe('reporter', () => {
  it('formatTable contains phase name and delivery rate', () => {
    const table = formatTable([fakePhase]);
    expect(table).toContain('peer-ramp-5');
    expect(table).toContain('99.3%');
  });

  it('computeNetworkStats calculates throughput from byte deltas', () => {
    const samples: NetworkSample[] = [
      { timestamp: 0,    wlanRxBytes: 0,         wlanTxBytes: 0,         tcpRetransSegs: 0,  rssiDbm: -60, linkSpeedMbps: 144 },
      { timestamp: 5000, wlanRxBytes: 5_000_000, wlanTxBytes: 3_000_000, tcpRetransSegs: 10, rssiDbm: -61, linkSpeedMbps: 144 },
    ];
    const stats = computeNetworkStats(samples, 5000);
    // (5MB + 3MB) * 8 bits / 5s = 12.8 Mbps
    expect(stats.throughputMbps).toBeCloseTo(12.8, 1);
    expect(stats.rssiDbm).toBe(-61);
  });
});
