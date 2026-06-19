import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatTable, formatSaturationAnalysis, computeNetworkStats, writeResults, formatWebrtcBlock, formatIperfComparison, formatDiscoverySection, formatRepresentativenessBanner, getModeLabel, formatCeilingSummary, formatHeadroomSummary, formatLinkHealthSummary } from '@/metrics/reporter';
import { CeilingResult } from '@/metrics/ceiling-rule';
import { HeadroomResult } from '@/metrics/laptop-headroom';
import { LinkHealthResult } from '@/metrics/link-health';
import { NetworkSample } from '@/metrics/network-sampler';
import { PhaseStats } from '@/metrics/collector';

const fakePhase: PhaseStats = {
  phaseName: 'peer-ramp-5', peerCount: 5, msgPerSec: 5, durationSec: 60,
  totalSent: 1500, totalAcked: 1490, deliveryRate: 0.9933, txQueueOverflowCount: 10,
  p50Ms: 12, p95Ms: 35, p99Ms: 80, rttStddevMs: 8, connectionErrors: 0,
  throughputMbps: 8.5, rssiDbm: -60, linkSpeedMbps: 144,
  iperfBaseline: null,
  iperfLoad: null,
  iceEstablishP50Ms: 0, iceEstablishP95Ms: 0, iceEstablishMaxMs: 0,
  connectionTimeouts: 0, rtpPacketsSent: 0, audioEstablishP95Ms: 0, videoEstablishP95Ms: 0,
  dcEstablishP95Ms: 0,
  connectedPeers: 5,
  discoveryCompleteness: 0, discoveryP50Ms: 0, discoveryP95Ms: 0,
  lagP95Ms: 0, lagValid: true,
  phoneRefused: null, arrivedButStalled: null, neverArrived: null,
  mediaInSdp: false,
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

    it('contains a Mbps column but no Loss% column', () => {
      const table = formatTable([fakePhase]);
      expect(table).toContain('Mbps');
      expect(table).toContain('8.5');
      expect(table).not.toContain('Loss%');
    });

    it('labels the RTT stddev column as RTT, not Jitter', () => {
      const table = formatTable([fakePhase]);
      expect(table).not.toContain('Jitter');
      expect(table).toMatch(/RTT/);
    });

    it('shows EL-p95 and Lag columns', () => {
      const table = formatTable([fakePhase]);
      expect(table).toContain('EL-p95');
      expect(table).toContain('Lag');
    });

    it('shows "ok" verdict when lagValid is true', () => {
      const table = formatTable([makePhase({ lagP95Ms: 10, lagValid: true })]);
      expect(table).toContain(' ok');
    });

    it('shows "LAG" verdict when lagValid is false', () => {
      const table = formatTable([makePhase({ lagP95Ms: 80, lagValid: false })]);
      expect(table).toContain('LAG');
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
      expect(stats.rssiDbm).toBeNull();
    });

    it('does not expose the removed packetLossPercent field', () => {
      const samples: NetworkSample[] = [
        { timestamp: 0,    wlanRxBytes: 0,    wlanTxBytes: 0,    tcpRetransSegs: 0,  rssiDbm: -60, linkSpeedMbps: 144 },
        { timestamp: 5000, wlanRxBytes: 1000, wlanTxBytes: 500,  tcpRetransSegs: 10, rssiDbm: -61, linkSpeedMbps: 144 },
      ];
      const stats = computeNetworkStats(samples, 5000);
      expect('packetLossPercent' in stats).toBe(false);
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
        expect(content.phases[0].txQueueOverflowCount).toBe(10);
        expect('packetLossPercent' in content.phases[0]).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('formatSaturationAnalysis', () => {
    it('reports no saturation when all phases are healthy', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 20, deliveryRate: 0.99, throughputMbps: 5  }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 25, deliveryRate: 0.98, throughputMbps: 9  }),
        makePhase({ phaseName: 'p3', peerCount: 8, p95Ms: 30, deliveryRate: 0.97, throughputMbps: 14 }),
      ];
      expect(formatSaturationAnalysis(phases)).toContain('No saturation detected');
    });

    it('returns insufficient-phases message for single phase', () => {
      expect(formatSaturationAnalysis([fakePhase])).toContain('at least 2');
    });

    it('identifies latency spike phase', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 30, deliveryRate: 0.99, throughputMbps: 5  }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 35, deliveryRate: 0.99, throughputMbps: 9  }),
        makePhase({ phaseName: 'p3', peerCount: 8, p95Ms: 90, deliveryRate: 0.99, throughputMbps: 14 }),
      ];
      const result = formatSaturationAnalysis(phases);
      expect(result).toContain('LATENCY SPIKE');
      expect(result).toContain('"p3"');
    });

    it('identifies throughput plateau when peer count increases but throughput stalls', () => {
      const phases = [
        makePhase({ phaseName: 'p1', peerCount: 2, p95Ms: 20, deliveryRate: 0.99, throughputMbps: 10   }),
        makePhase({ phaseName: 'p2', peerCount: 4, p95Ms: 22, deliveryRate: 0.99, throughputMbps: 10.5 }),
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

  describe('formatCeilingSummary', () => {
    const ceilingPhase = makePhase({
      phaseName: 'p4', peerCount: 4, connectedPeers: 4,
      iceEstablishP95Ms: 280, connectionTimeouts: 0, lagValid: true,
    });

    it('reports undetermined when no lag-valid phases', () => {
      const result: CeilingResult = { ceilingPeerCount: 0, openEnded: false, belowRange: true, validPhaseCount: 0 };
      const out = formatCeilingSummary([], result);
      expect(out).toContain('undetermined');
    });

    it('reports below-range when all valid phases degraded', () => {
      const result: CeilingResult = { ceilingPeerCount: 0, openEnded: false, belowRange: true, validPhaseCount: 2 };
      const out = formatCeilingSummary([ceilingPhase], result);
      expect(out).toContain('below tested range');
      expect(out).toContain('2 lag-valid phase');
    });

    it('shows ceiling peer count and secondary signals', () => {
      const result: CeilingResult = { ceilingPeerCount: 4, openEnded: false, belowRange: false, validPhaseCount: 3 };
      const out = formatCeilingSummary([ceilingPhase], result);
      expect(out).toContain('4 peers');
      expect(out).toContain('280ms');
      expect(out).toContain('0.0%');
      expect(out).toContain('3 lag-valid phase');
    });

    it('annotates open-ended ceiling with a note', () => {
      const result: CeilingResult = { ceilingPeerCount: 4, openEnded: true, belowRange: false, validPhaseCount: 1 };
      const out = formatCeilingSummary([ceilingPhase], result);
      expect(out).toMatch(/range not exhausted|real ceiling may be higher/i);
    });

    it('does not annotate open-ended when ceiling is not open-ended', () => {
      const result: CeilingResult = { ceilingPeerCount: 4, openEnded: false, belowRange: false, validPhaseCount: 2 };
      const out = formatCeilingSummary([ceilingPhase], result);
      expect(out).not.toMatch(/range not exhausted/i);
    });

    it('shows timeout rate from the ceiling phase', () => {
      const timedOutPhase = makePhase({
        peerCount: 4, connectedPeers: 4, connectionTimeouts: 2,
        iceEstablishP95Ms: 400, lagValid: true,
      });
      const result: CeilingResult = { ceilingPeerCount: 5, openEnded: false, belowRange: false, validPhaseCount: 2 };
      const out = formatCeilingSummary([timedOutPhase, makePhase({ peerCount: 5, connectedPeers: 5, lagValid: true, iceEstablishP95Ms: 500, connectionTimeouts: 1 })], result);
      // peerCount=5, timeouts=1 → 20%
      expect(out).toContain('20.0%');
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
        txQueueOverflowCount: 10,
        p50Ms: 20,
        p95Ms: 45,
        p99Ms: 80,
        rttStddevMs: 5,
        connectionErrors: 0,
        throughputMbps: 1.2,
        rssiDbm: null,
        linkSpeedMbps: null,
        iperfBaseline: null,
        iperfLoad: null,
        iceEstablishP50Ms: 142,
        iceEstablishP95Ms: 381,
        iceEstablishMaxMs: 892,
        connectionTimeouts: 0,
        rtpPacketsSent: 0,
        audioEstablishP95Ms: 0,
        videoEstablishP95Ms: 0,
        dcEstablishP95Ms: 0,
        connectedPeers: 4,
        discoveryCompleteness: 0,
        discoveryP50Ms: 0,
        discoveryP95Ms: 0,
        lagP95Ms: 0,
        lagValid: true,
        phoneRefused: null,
        arrivedButStalled: null,
        neverArrived: null,
        mediaInSdp: false,
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
        makeWebrtcPhase({ rtpPacketsSent: 4600, audioEstablishP95Ms: 410, videoEstablishP95Ms: 520 }),
      );
      expect(output).toContain('Call');
      expect(output).toContain('4600');
      expect(output).toContain('410');
      expect(output).toContain('520');
    });

    it('does not report an RTP packets lost line (media is load-only)', () => {
      const output = formatWebrtcBlock(
        makeWebrtcPhase({ rtpPacketsSent: 4600, audioEstablishP95Ms: 410, videoEstablishP95Ms: 520 }),
      );
      expect(output).not.toMatch(/lost/i);
    });

    it('shows laptop gate as ok when lagValid is true', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ lagP95Ms: 12, lagValid: true }));
      expect(output).toContain('Laptop gate');
      expect(output).toContain('12ms');
      expect(output).toMatch(/ok/i);
    });

    it('shows laptop gate as INVALID when lagValid is false', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ lagP95Ms: 75, lagValid: false }));
      expect(output).toContain('Laptop gate');
      expect(output).toContain('75ms');
      expect(output).toContain('INVALID');
    });

    it('shows attribution unavailable when phoneRefused and neverArrived are null', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ phoneRefused: null, arrivedButStalled: null, neverArrived: null }));
      expect(output).toContain('unavailable');
      expect(output).not.toContain('phone-refused');
    });

    it('shows all three attribution buckets when attribution is provided', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ phoneRefused: 2, arrivedButStalled: 5, neverArrived: 3 }));
      expect(output).toContain('phone-refused');
      expect(output).toContain('arrived-but-stalled');
      expect(output).toContain('never-arrived');
      expect(output).toContain('2');
      expect(output).toContain('5');
      expect(output).toContain('3');
    });

    it('shows zero counts when attribution is available but no failures occurred', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ phoneRefused: 0, arrivedButStalled: 0, neverArrived: 0 }));
      expect(output).toContain('phone-refused');
      expect(output).toContain(': 0');
    });

    it('shows mediaInSdp: false when no track was added', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ mediaInSdp: false }));
      expect(output).toContain('mediaInSdp');
      expect(output).toContain('false');
      expect(output).not.toContain('SendOnly');
    });

    it('shows mediaInSdp: true and SendOnly note when media was added to SDP', () => {
      const output = formatWebrtcBlock(makeWebrtcPhase({ mediaInSdp: true }));
      expect(output).toContain('mediaInSdp');
      expect(output).toContain('true');
      expect(output).toContain('SendOnly');
    });
  });

  describe('formatLinkHealthSummary', () => {
    it('shows ok verdict for a healthy baseline', () => {
      const result: LinkHealthResult = { healthy: true, throughputMbps: 940, lossPercent: 0.01, reason: null };
      const out = formatLinkHealthSummary(result);
      expect(out).toMatch(/ok/i);
      expect(out).toContain('940');
      expect(out).toContain('0.01');
    });

    it('shows DEGRADED verdict and reason when link is unhealthy', () => {
      const result: LinkHealthResult = { healthy: false, throughputMbps: 3, lossPercent: 0.1, reason: 'throughput 3 Mbps below 10 Mbps threshold' };
      const out = formatLinkHealthSummary(result);
      expect(out).toMatch(/DEGRADED/);
      expect(out).toContain('throughput 3 Mbps below 10 Mbps threshold');
    });

    it('shows ok when no baseline is available (null → healthy passthrough)', () => {
      const result: LinkHealthResult = { healthy: true, throughputMbps: 0, lossPercent: 0, reason: null };
      const out = formatLinkHealthSummary(result);
      expect(out).toMatch(/ok/i);
    });

    it('includes measured values in ok verdict', () => {
      const result: LinkHealthResult = { healthy: true, throughputMbps: 500, lossPercent: 0.5, reason: null };
      const out = formatLinkHealthSummary(result);
      expect(out).toContain('500');
      expect(out).toContain('0.5');
    });
  });

  describe('formatHeadroomSummary', () => {
    function headroom(overrides: Partial<HeadroomResult>): HeadroomResult {
      return { verdict: 'headroom-ok', loopbackCeiling: 20, phoneCeiling: 8, ...overrides };
    }

    it('shows headroom-ok with ceilings and margin', () => {
      const out = formatHeadroomSummary(headroom({ loopbackCeiling: 20, phoneCeiling: 8 }));
      expect(out).toContain('headroom-ok');
      expect(out).toContain('20 peers');
      expect(out).toContain('8 peers');
      expect(out).toContain('2.5×');
    });

    it('shows borderline verdict', () => {
      const out = formatHeadroomSummary(headroom({ verdict: 'borderline', loopbackCeiling: 12, phoneCeiling: 8 }));
      expect(out).toContain('borderline');
      expect(out).toContain('1.5×');
    });

    it('shows insufficient verdict', () => {
      const out = formatHeadroomSummary(headroom({ verdict: 'insufficient', loopbackCeiling: 8, phoneCeiling: 8 }));
      expect(out).toContain('insufficient');
      expect(out).toContain('1.0×');
    });

    it('shows undetermined when no loopback data', () => {
      const out = formatHeadroomSummary(headroom({ verdict: 'undetermined', loopbackCeiling: 0, phoneCeiling: 8 }));
      expect(out).toContain('undetermined');
      expect(out).toContain('unavailable');
    });
  });
});
