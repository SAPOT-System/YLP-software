import { MetricsCollector } from '@/metrics/collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  beforeEach(() => { collector = new MetricsCollector(); });

  it('computes delivery rate correctly', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) collector.recordSent('peer-1', now + i);
    for (let i = 0; i < 8; i++) collector.recordAcked('peer-1', now + i, 20);
    for (let i = 0; i < 2; i++) collector.recordDropped('peer-1');
    const stats = collector.computeStats('test', 1, 10, 60, now, now + 10000);
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
    const stats = collector.computeStats('test', 1, 10, 60, now, now + 100000);
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
    expect(collector.computeStats('test', 1, 10, 60, now, now + 10000).jitterMs).toBe(0);
  });

  it('resets cleanly between phases', () => {
    const now = Date.now();
    collector.recordSent('peer-1', now);
    collector.reset();
    expect(collector.computeStats('after-reset', 1, 1, 10, now, now + 1000).totalSent).toBe(0);
  });

  it('network fields default to 0 / null before orchestrator merge', () => {
    const now = Date.now();
    collector.recordSent('peer-1', now);
    collector.recordAcked('peer-1', now, 10);
    const stats = collector.computeStats('test', 1, 1, 5, now, now + 5000);
    expect(stats.throughputMbps).toBe(0);
    expect(stats.packetLossPercent).toBe(0);
    expect(stats.rssiDbm).toBeNull();
    expect(stats.linkSpeedMbps).toBeNull();
  });

  describe('WebRTC metrics', () => {
    it('recordIceEstablish is reflected in p50/p95/max', () => {
      collector.recordIceEstablish('peer-1', 80);
      collector.recordIceEstablish('peer-1', 120);
      const stats = collector.computeStats('phase', 2, 1, 5, 0, 5000);
      expect(stats.iceEstablishP50Ms).toBe(80);
      expect(stats.iceEstablishP95Ms).toBe(120);
      expect(stats.iceEstablishMaxMs).toBe(120);
    });

    it('recordConnectionTimeout is counted in stats', () => {
      collector.recordConnectionTimeout();
      collector.recordConnectionTimeout();
      const stats = collector.computeStats('phase', 4, 1, 5, 0, 5000);
      expect(stats.connectionTimeouts).toBe(2);
    });

    it('recordRtpSent and recordRtpLost accumulate counts', () => {
      for (let i = 0; i < 100; i++) collector.recordRtpSent('peer-1');
      for (let i = 0; i < 5; i++) collector.recordRtpLost('peer-1');
      const stats = collector.computeStats('phase', 1, 1, 5, 0, 5000);
      expect(stats.rtpPacketsSent).toBe(100);
      expect(stats.rtpPacketsLost).toBe(5);
    });

    it('recordMediaEstablish is reflected in mediaEstablishP95Ms', () => {
      collector.recordMediaEstablish('peer-1', 300);
      const stats = collector.computeStats('phase', 2, 1, 5, 0, 5000);
      expect(stats.mediaEstablishP95Ms).toBe(300);
    });

    it('reset() clears all WebRTC fields', () => {
      collector.recordIceEstablish('peer-1', 100);
      collector.recordConnectionTimeout();
      collector.recordRtpSent('peer-1');
      collector.recordRtpLost('peer-1');
      collector.recordMediaEstablish('peer-1', 200);
      collector.reset();
      const stats = collector.computeStats('phase', 2, 1, 5, 0, 5000);
      expect(stats.iceEstablishP50Ms).toBe(0);
      expect(stats.connectionTimeouts).toBe(0);
      expect(stats.rtpPacketsSent).toBe(0);
      expect(stats.rtpPacketsLost).toBe(0);
      expect(stats.mediaEstablishP95Ms).toBe(0);
    });

    it('returns zero WebRTC stats when no WebRTC events recorded', () => {
      const stats = collector.computeStats('phase', 2, 1, 5, 0, 5000);
      expect(stats.iceEstablishP50Ms).toBe(0);
      expect(stats.iceEstablishMaxMs).toBe(0);
      expect(stats.connectionTimeouts).toBe(0);
      expect(stats.rtpPacketsSent).toBe(0);
      expect(stats.mediaEstablishP95Ms).toBe(0);
    });
  });
});
