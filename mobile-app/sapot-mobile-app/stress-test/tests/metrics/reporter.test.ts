import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatTable, formatSaturationAnalysis, computeNetworkStats, writeResults, formatWebrtcBlock } from '@/metrics/reporter';
import { NetworkSample } from '@/metrics/network-sampler';
import { PhaseStats } from '@/metrics/collector';

const fakePhase: PhaseStats = {
  phaseName: 'peer-ramp-5', peerCount: 5, msgPerSec: 5, durationSec: 60,
  totalSent: 1500, totalAcked: 1490, deliveryRate: 0.9933, droppedCount: 10,
  p50Ms: 12, p95Ms: 35, p99Ms: 80, jitterMs: 8, connectionErrors: 0, wsPeakQueueFills: 0,
  throughputMbps: 8.5, packetLossPercent: 0.02, rssiDbm: -60, linkSpeedMbps: 144,
  iperfStats: null,
  iceEstablishP50Ms: 0, iceEstablishP95Ms: 0, iceEstablishMaxMs: 0,
  connectionTimeouts: 0, rtpPacketsSent: 0, rtpPacketsLost: 0, mediaEstablishP95Ms: 0,
};

function makePhase(overrides: Partial<PhaseStats>): PhaseStats {
  return { ...fakePhase, ...overrides };
}

describe('reporter', () => {
  describe('formatTable', () => {
    it('contains phase name and delivery rate', () => {
      const table = formatTable([fakePhase]);
      expect(table).toContain('peer-ramp-5');
      expect(table).toContain('99.3%');
    });

    it('contains Mbps and Loss% columns', () => {
      const table = formatTable([fakePhase]);
      expect(table).toContain('Mbps');
      expect(table).toContain('Loss%');
      expect(table).toContain('8.5');
      expect(table).toContain('0.02%');
    });
  });

  describe('computeNetworkStats', () => {
    it('calculates throughput from byte deltas', () => {
      const samples: NetworkSample[] = [
        { timestamp: 0,    wlanRxBytes: 0,         wlanTxBytes: 0,         tcpRetransSegs: 0,  rssiDbm: -60, linkSpeedMbps: 144 },
        { timestamp: 5000, wlanRxBytes: 5_000_000, wlanTxBytes: 3_000_000, tcpRetransSegs: 10, rssiDbm: -61, linkSpeedMbps: 144 },
      ];
      const stats = computeNetworkStats(samples, 5000);
      // (5MB + 3MB) * 8 bits / 5s = 12.8 Mbps
      expect(stats.throughputMbps).toBeCloseTo(12.8, 1);
      expect(stats.rssiDbm).toBe(-61);
    });

    it('returns zero stats for empty sample array', () => {
      const stats = computeNetworkStats([], 5000);
      expect(stats.throughputMbps).toBe(0);
      expect(stats.packetLossPercent).toBe(0);
      expect(stats.rssiDbm).toBeNull();
    });

    it('returns zero stats for single sample', () => {
      const samples: NetworkSample[] = [
        { timestamp: 0, wlanRxBytes: 1000, wlanTxBytes: 500, tcpRetransSegs: 1, rssiDbm: -55, linkSpeedMbps: 72 },
      ];
      const stats = computeNetworkStats(samples, 5000);
      expect(stats.throughputMbps).toBe(0);
    });
  });

  describe('writeResults', () => {
    it('creates output file with correct JSON structure', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-test-'));
      try {
        writeResults(tmpDir, 'ws', [fakePhase]);
        const files = fs.readdirSync(tmpDir);
        expect(files).toHaveLength(1);
        const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
        expect(content.transport).toBe('ws');
        expect(content.phases).toHaveLength(1);
        expect(content.phases[0].throughputMbps).toBe(8.5);
        expect(content.phases[0].packetLossPercent).toBe(0.02);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('formatSaturationAnalysis', () => {
    it('reports no saturation when all phases are healthy', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 20, packetLossPercent: 0,   deliveryRate: 0.99, throughputMbps: 5  }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 25, packetLossPercent: 0.1, deliveryRate: 0.98, throughputMbps: 9  }),
        makePhase({ phaseName: 'p3', peerCount: 8, p95Ms: 30, packetLossPercent: 0.2, deliveryRate: 0.97, throughputMbps: 14 }),
      ];
      expect(formatSaturationAnalysis(phases)).toContain('No saturation detected');
    });

    it('returns insufficient-phases message for single phase', () => {
      expect(formatSaturationAnalysis([fakePhase])).toContain('at least 2');
    });

    it('identifies latency spike phase', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 30, packetLossPercent: 0, deliveryRate: 0.99, throughputMbps: 5  }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 35, packetLossPercent: 0, deliveryRate: 0.99, throughputMbps: 9  }),
        makePhase({ phaseName: 'p3', peerCount: 8, p95Ms: 90, packetLossPercent: 0, deliveryRate: 0.99, throughputMbps: 14 }),
      ];
      const result = formatSaturationAnalysis(phases);
      expect(result).toContain('LATENCY SPIKE');
      expect(result).toContain('"p3"');
    });

    it('identifies packet loss onset phase', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 20, packetLossPercent: 0,   deliveryRate: 0.99, throughputMbps: 5 }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 22, packetLossPercent: 1.5, deliveryRate: 0.98, throughputMbps: 9 }),
      ];
      const result = formatSaturationAnalysis(phases);
      expect(result).toContain('PACKET LOSS');
      expect(result).toContain('"p2"');
    });

    it('identifies throughput plateau when peer count increases but throughput stalls', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 20, packetLossPercent: 0, deliveryRate: 0.99, throughputMbps: 10   }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 22, packetLossPercent: 0, deliveryRate: 0.99, throughputMbps: 10.5 }),
      ];
      const result = formatSaturationAnalysis(phases);
      expect(result).toContain('THROUGHPUT PLATEAU');
      expect(result).toContain('"p2"');
    });
  });

  describe('formatWebrtcBlock', () => {
    function makeWebrtcPhase(overrides: Partial<PhaseStats> = {}): PhaseStats {
      return {
        phaseName: 'webrtc-4p',
        peerCount: 4,
        msgPerSec: 5,
        durationSec: 10,
        totalSent: 200,
        totalAcked: 190,
        deliveryRate: 0.95,
        droppedCount: 10,
        p50Ms: 20,
        p95Ms: 45,
        p99Ms: 80,
        jitterMs: 5,
        connectionErrors: 0,
        wsPeakQueueFills: 0,
        throughputMbps: 1.2,
        packetLossPercent: 0.1,
        rssiDbm: null,
        linkSpeedMbps: null,
        iperfStats: null,
        iceEstablishP50Ms: 142,
        iceEstablishP95Ms: 381,
        iceEstablishMaxMs: 892,
        connectionTimeouts: 0,
        rtpPacketsSent: 0,
        rtpPacketsLost: 0,
        mediaEstablishP95Ms: 0,
        ...overrides,
      };
    }

    it('shows pair count and connection summary', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ connectionTimeouts: 1 }), 4);
      expect(output).toContain('pairs attempted');
      expect(output).toContain('2');
      expect(output).toContain('timed out');
      expect(output).toContain('1');
    });

    it('reduces connected peer count by connectionErrors', () => {
      // 4 peers, 2 failed to connect → 2/4 connected (50%)
      const output = formatWebrtcBlock(makeWebrtcPhase({ connectionErrors: 2 }), 4);
      expect(output).toContain('2/4');
      expect(output).toContain('50%');
    });

    it('reports 100% connected when there are no connection errors', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ connectionErrors: 0 }), 4);
      expect(output).toContain('4/4');
      expect(output).toContain('100%');
    });

    it('shows ICE establish percentiles', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase(), 4);
      expect(output).toContain('142');
      expect(output).toContain('381');
      expect(output).toContain('892');
    });

    it('shows Chat section with sent/acked/dropped', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase(), 4);
      expect(output).toContain('Chat');
      expect(output).toContain('200');
      expect(output).toContain('190');
    });

    it('omits Call section when rtpPacketsSent is 0', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ rtpPacketsSent: 0 }), 4);
      expect(output).not.toContain('Call');
    });

    it('shows Call section when rtpPacketsSent > 0', () => {
      const output = formatWebrtcBlock(
        makeWebrtcPhase({ rtpPacketsSent: 4600, rtpPacketsLost: 12, mediaEstablishP95Ms: 410 }),
        50,
      );
      expect(output).toContain('Call');
      expect(output).toContain('4600');
      expect(output).toContain('410');
    });
  });
});
