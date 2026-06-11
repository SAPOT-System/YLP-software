import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatTable, computeNetworkStats, writeResults } from '@/metrics/reporter';
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

  it('computeNetworkStats returns zero stats for empty sample array', () => {
    const stats = computeNetworkStats([], 5000);
    expect(stats.throughputMbps).toBe(0);
    expect(stats.packetLossPercent).toBe(0);
    expect(stats.rssiDbm).toBeNull();
  });

  it('computeNetworkStats returns zero stats for single sample', () => {
    const samples: NetworkSample[] = [
      { timestamp: 0, wlanRxBytes: 1000, wlanTxBytes: 500, tcpRetransSegs: 1, rssiDbm: -55, linkSpeedMbps: 72 },
    ];
    const stats = computeNetworkStats(samples, 5000);
    expect(stats.throughputMbps).toBe(0);
  });

  it('writeResults creates output file with correct JSON structure', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-test-'));
    try {
      const fakeNetStats = {
        throughputMbps: 5.2,
        packetLossPercent: 0.01,
        rssiDbm: -58,
        linkSpeedMbps: 144,
        interfaceRxMb: 3.1,
        interfaceTxMb: 2.0,
      };
      writeResults(tmpDir, 'ws', [fakePhase], fakeNetStats);
      const files = fs.readdirSync(tmpDir);
      expect(files).toHaveLength(1);
      const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
      expect(content.transport).toBe('ws');
      expect(content.phases).toHaveLength(1);
      expect(content.networkStats.throughputMbps).toBe(5.2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
