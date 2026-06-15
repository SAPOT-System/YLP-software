import { MetricsCollector } from '@/metrics/collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  beforeEach(() => { collector = new MetricsCollector(); });

  it('computes delivery rate correctly', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) collector.recordSent('peer-1', now + i);
    for (let i = 0; i < 8; i++) collector.recordAcked('peer-1', now + i, 20);
    for (let i = 0; i < 2; i++) collector.recordDropped('peer-1');
    const stats = collector.computeStats('test', 1, 10, 60, 0);
    expect(stats.totalSent).toBe(10);
    expect(stats.totalAcked).toBe(8);
    expect(stats.deliveryRate).toBeCloseTo(0.8);
    expect(stats.droppedCount).toBe(2);
  });

  it('computes latency percentiles', () => {
    const now = Date.now();
    for (let ms = 1; ms <= 100; ms++) {
      collector.recordSent('peer-1', now);
      collector.recordAcked('peer-1', now, ms);
    }
    const stats = collector.computeStats('test', 1, 10, 60, 0);
    expect(stats.p50Ms).toBe(50);
    expect(stats.p95Ms).toBe(95);
    expect(stats.p99Ms).toBe(99);
  });

  it('jitter is 0 when all latencies are equal', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      collector.recordSent('peer-1', now);
      collector.recordAcked('peer-1', now, 20);
    }
    expect(collector.computeStats('test', 1, 10, 60, 0).jitterMs).toBe(0);
  });

  it('resets cleanly between phases', () => {
    const now = Date.now();
    collector.recordSent('peer-1', now);
    collector.reset();
    expect(collector.computeStats('after-reset', 1, 1, 10, 0).totalSent).toBe(0);
  });

  it('network fields default to 0 / null before orchestrator merge', () => {
    const now = Date.now();
    collector.recordSent('peer-1', now);
    collector.recordAcked('peer-1', now, 10);
    const stats = collector.computeStats('test', 1, 1, 5, 0);
    expect(stats.throughputMbps).toBe(0);
    expect(stats.packetLossPercent).toBe(0);
    expect(stats.rssiDbm).toBeNull();
    expect(stats.linkSpeedMbps).toBeNull();
  });

  it('connectedPeers is passed through from the argument', () => {
    const stats = collector.computeStats('phase', 4, 1, 5, 3);
    expect(stats.connectedPeers).toBe(3);
  });

  describe('WebRTC metrics', () => {
    it('recordIceEstablish is reflected in p50/p95/max', () => {
      collector.recordIceEstablish('peer-1', 80);
      collector.recordIceEstablish('peer-1', 120);
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.iceEstablishP50Ms).toBe(80);
      expect(stats.iceEstablishP95Ms).toBe(120);
      expect(stats.iceEstablishMaxMs).toBe(120);
    });

    it('recordConnectionTimeout is counted in stats', () => {
      collector.recordConnectionTimeout();
      collector.recordConnectionTimeout();
      const stats = collector.computeStats('phase', 4, 1, 5, 0);
      expect(stats.connectionTimeouts).toBe(2);
    });

    it('recordRtpSent and recordRtpLost accumulate counts', () => {
      for (let i = 0; i < 100; i++) collector.recordRtpSent('peer-1');
      for (let i = 0; i < 5; i++) collector.recordRtpLost('peer-1');
      const stats = collector.computeStats('phase', 1, 1, 5, 0);
      expect(stats.rtpPacketsSent).toBe(100);
      expect(stats.rtpPacketsLost).toBe(5);
    });

    it('recordMediaEstablish is reflected in mediaEstablishP95Ms', () => {
      collector.recordMediaEstablish('peer-1', 300);
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.mediaEstablishP95Ms).toBe(300);
    });

    it('recordDcEstablish is reflected in dcEstablishP95Ms', () => {
      collector.recordDcEstablish('peer-1', 150);
      collector.recordDcEstablish('peer-2', 200);
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.dcEstablishP95Ms).toBe(200);
    });

    it('dcEstablishP95Ms is 0 when no dc establish events recorded', () => {
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.dcEstablishP95Ms).toBe(0);
    });

    it('reset() clears all WebRTC fields', () => {
      collector.recordIceEstablish('peer-1', 100);
      collector.recordConnectionTimeout();
      collector.recordRtpSent('peer-1');
      collector.recordRtpLost('peer-1');
      collector.recordMediaEstablish('peer-1', 200);
      collector.recordDcEstablish('peer-1', 180);
      collector.reset();
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.iceEstablishP50Ms).toBe(0);
      expect(stats.connectionTimeouts).toBe(0);
      expect(stats.rtpPacketsSent).toBe(0);
      expect(stats.rtpPacketsLost).toBe(0);
      expect(stats.mediaEstablishP95Ms).toBe(0);
      expect(stats.dcEstablishP95Ms).toBe(0);
    });

    it('returns zero WebRTC stats when no WebRTC events recorded', () => {
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.iceEstablishP50Ms).toBe(0);
      expect(stats.iceEstablishMaxMs).toBe(0);
      expect(stats.connectionTimeouts).toBe(0);
      expect(stats.rtpPacketsSent).toBe(0);
      expect(stats.mediaEstablishP95Ms).toBe(0);
      expect(stats.dcEstablishP95Ms).toBe(0);
    });
  });

  describe('discovery probe metrics', () => {
    it('discoveryCompleteness is 0 when no probes recorded', () => {
      const stats = collector.computeStats('phase', 4, 1, 5, 0);
      expect(stats.discoveryCompleteness).toBe(0);
    });

    it('recording one probe out of two peers gives 0.5 completeness', () => {
      collector.recordDiscoveryProbe('peer-0', 120);
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.discoveryCompleteness).toBe(0.5);
    });

    it('recording probes for all peers gives 1.0 completeness', () => {
      collector.recordDiscoveryProbe('peer-0', 80);
      collector.recordDiscoveryProbe('peer-1', 95);
      collector.recordDiscoveryProbe('peer-2', 110);
      const stats = collector.computeStats('phase', 3, 1, 5, 0);
      expect(stats.discoveryCompleteness).toBe(1.0);
    });

    it('duplicate probes for the same peer are deduplicated', () => {
      collector.recordDiscoveryProbe('peer-0', 50);
      collector.recordDiscoveryProbe('peer-0', 200);
      const stats = collector.computeStats('phase', 1, 1, 5, 0);
      expect(stats.discoveryCompleteness).toBe(1.0);
      expect(stats.discoveryP50Ms).toBe(50);
    });

    it('discovery latency percentiles reflect first-probe latencies', () => {
      collector.recordDiscoveryProbe('peer-0', 10);
      collector.recordDiscoveryProbe('peer-1', 50);
      collector.recordDiscoveryProbe('peer-2', 100);
      const stats = collector.computeStats('phase', 3, 1, 5, 0);
      expect(stats.discoveryP50Ms).toBe(50);
      expect(stats.discoveryP95Ms).toBe(100);
    });

    it('reset() clears discovery probes', () => {
      collector.recordDiscoveryProbe('peer-0', 80);
      collector.reset();
      const stats = collector.computeStats('phase', 2, 1, 5, 0);
      expect(stats.discoveryCompleteness).toBe(0);
      expect(stats.discoveryP50Ms).toBe(0);
    });

    it('discoveryCompleteness is 0 when peerCount is 0', () => {
      collector.recordDiscoveryProbe('peer-0', 50);
      const stats = collector.computeStats('phase', 0, 1, 5, 0);
      expect(stats.discoveryCompleteness).toBe(0);
    });
  });
});
