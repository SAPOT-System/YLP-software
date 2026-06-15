import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatTable, formatSaturationAnalysis, computeNetworkStats, writeResults, formatWebrtcBlock, formatIperfComparison, formatDiscoverySection, formatRepresentativenessBanner, getModeLabel } from '@/metrics/reporter';
import { NetworkSample } from '@/metrics/network-sampler';
import { PhaseStats } from '@/metrics/collector';

const fakePhase: PhaseStats = {
  phaseName: 'peer-ramp-5', peerCount: 5, msgPerSec: 5, durationSec: 60,
  totalSent: 1500, totalAcked: 1490, deliveryRate: 0.9933, droppedCount: 10,
  p50Ms: 12, p95Ms: 35, p99Ms: 80, jitterMs: 8, connectionErrors: 0,
  throughputMbps: 8.5, packetLossPercent: 0.02, rssiDbm: -60, linkSpeedMbps: 144,
  iperfBaseline: null,
  iperfLoad: null,
  iceEstablishP50Ms: 0, iceEstablishP95Ms: 0, iceEstablishMaxMs: 0,
  connectionTimeouts: 0, rtpPacketsSent: 0, rtpPacketsLost: 0, audioEstablishP95Ms: 0, videoEstablishP95Ms: 0,
  dcEstablishP95Ms: 0,
  connectedPeers: 5,
  discoveryCompleteness: 0, discoveryP50Ms: 0, discoveryP95Ms: 0,
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

  describe('formatIperfComparison', () => {
    const baseline = { throughputMbps: 940, lossPercent: 0.01, jitterMs: 0.1, lostPackets: 1, totalPackets: 10000 };
    const underLoad = { throughputMbps: 600, lossPercent: 2.5, jitterMs: 4.8, lostPackets: 250, totalPackets: 10000 };

    it('returns empty string when no phase has iperf data', () => {
      expect(formatIperfComparison([fakePhase])).toBe('');
    });

    it('shows both baseline and under-load stages for a phase', () => {
      const out = formatIperfComparison([makePhase({ iperfBaseline: baseline, iperfLoad: underLoad })]);
      expect(out).toContain('baseline');
      expect(out).toContain('under-load');
      expect(out).toContain('940');
      expect(out).toContain('600');
    });

    it('reports the throughput delta as a percentage drop vs baseline', () => {
      const out = formatIperfComparison([makePhase({ iperfBaseline: baseline, iperfLoad: underLoad })]);
      // (600 - 940) / 940 = -36.2%
      expect(out).toContain('-36.2%');
    });

    it('omits the delta row when one stage is missing', () => {
      const out = formatIperfComparison([makePhase({ iperfBaseline: null, iperfLoad: underLoad })]);
      expect(out).toContain('under-load');
      expect(out).not.toContain('Δ');
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

  describe('formatDiscoverySection', () => {
    it('returns empty string when all phases have zero discoveryCompleteness', () => {
      const out = formatDiscoverySection([fakePhase]);
      expect(out).toBe('');
    });

    it('shows completeness percentage for a phase with discovery data', () => {
      const phase = makePhase({ discoveryCompleteness: 0.8, discoveryP50Ms: 320, discoveryP95Ms: 640 });
      const out = formatDiscoverySection([phase]);
      expect(out).toContain('80.0%');
      expect(out).toContain('320');
      expect(out).toContain('640');
    });

    it('shows 100% completeness when all peers probed', () => {
      const phase = makePhase({ phaseName: 'star-10p', discoveryCompleteness: 1.0, discoveryP50Ms: 200, discoveryP95Ms: 450 });
      const out = formatDiscoverySection([phase]);
      expect(out).toContain('100.0%');
    });

    it('includes a Discovery header', () => {
      const phase = makePhase({ discoveryCompleteness: 0.5, discoveryP50Ms: 100, discoveryP95Ms: 300 });
      const out = formatDiscoverySection([phase]);
      expect(out).toContain('Discovery');
    });

    it('includes completeness and latency labels', () => {
      const phase = makePhase({ discoveryCompleteness: 0.6, discoveryP50Ms: 150, discoveryP95Ms: 400 });
      const out = formatDiscoverySection([phase]);
      expect(out).toContain('completeness');
      expect(out).toContain('p50');
      expect(out).toContain('p95');
    });
  });

  describe('formatRepresentativenessBanner', () => {
    it('labels ws-signaled as a server-signaling test', () => {
      const banner = formatRepresentativenessBanner('ws-signaled', false);
      expect(banner).toMatch(/server.signaling/i);
      expect(banner).toMatch(/FastAPI|relay/i);
    });

    it('labels tcp-signaled loopback pair as a protocol/CPU smoke test', () => {
      const banner = formatRepresentativenessBanner('tcp-signaled', false);
      expect(banner).toMatch(/smoke/i);
    });

    it('labels tcp-signaled star as phone-real for discovery, peer-side for WebRTC', () => {
      const banner = formatRepresentativenessBanner('tcp-signaled', true);
      expect(banner).toMatch(/phone.real|phone real/i);
      expect(banner).toMatch(/libdatachannel|peer.side|not.*phone/i);
    });

    it('notes that ws-signaled is not a local-network test', () => {
      const banner = formatRepresentativenessBanner('ws-signaled', false);
      expect(banner).not.toMatch(/local.network test/i);
    });
  });

  describe('getModeLabel', () => {
    it('labels ws-signaled as server-signaling', () => {
      expect(getModeLabel('ws-signaled', false)).toMatch(/server.signaling/i);
    });

    it('labels tcp-signaled pair as protocol smoke test', () => {
      expect(getModeLabel('tcp-signaled', false)).toMatch(/smoke/i);
    });

    it('labels tcp-signaled star as local-network', () => {
      expect(getModeLabel('tcp-signaled', true)).toMatch(/local.network/i);
    });

    it('falls back to the raw mode string for unknown modes', () => {
      expect(getModeLabel('unknown-mode', false)).toBe('unknown-mode');
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
        throughputMbps: 1.2,
        packetLossPercent: 0.1,
        rssiDbm: null,
        linkSpeedMbps: null,
        iperfBaseline: null,
        iperfLoad: null,
        iceEstablishP50Ms: 142,
        iceEstablishP95Ms: 381,
        iceEstablishMaxMs: 892,
        connectionTimeouts: 0,
        rtpPacketsSent: 0,
        rtpPacketsLost: 0,
        audioEstablishP95Ms: 0,
        videoEstablishP95Ms: 0,
        dcEstablishP95Ms: 0,
        connectedPeers: 4,
        discoveryCompleteness: 0,
        discoveryP50Ms: 0,
        discoveryP95Ms: 0,
        ...overrides,
      };
    }

    it('shows pair count and connection summary', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ connectionTimeouts: 1 }));
      expect(output).toContain('pairs attempted');
      expect(output).toContain('2');
      expect(output).toContain('timed out');
      expect(output).toContain('1');
    });

    it('uses connectedPeers directly for the headline connected count', () => {
      // connectedPeers=2 out of peerCount=4 → 2/4 (50%)
      const output = formatWebrtcBlock(makeWebrtcPhase({ connectedPeers: 2 }));
      expect(output).toContain('2/4');
      expect(output).toContain('50%');
    });

    it('reports 100% connected when connectedPeers equals peerCount', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ connectedPeers: 4 }));
      expect(output).toContain('4/4');
      expect(output).toContain('100%');
    });

    it('shows ICE establish percentiles', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase());
      expect(output).toContain('142');
      expect(output).toContain('381');
      expect(output).toContain('892');
    });

    it('shows Chat section with sent/acked/dropped', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase());
      expect(output).toContain('Chat');
      expect(output).toContain('200');
      expect(output).toContain('190');
    });

    it('omits Call section when rtpPacketsSent is 0', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ rtpPacketsSent: 0 }));
      expect(output).not.toContain('Call');
    });

    it('shows Call section when rtpPacketsSent > 0', () => {
      const output = formatWebrtcBlock(
        makeWebrtcPhase({ rtpPacketsSent: 4600, rtpPacketsLost: 12, audioEstablishP95Ms: 410, videoEstablishP95Ms: 520 }),
      );
      expect(output).toContain('Call');
      expect(output).toContain('4600');
      expect(output).toContain('410');
      expect(output).toContain('520');
    });
  });
});
