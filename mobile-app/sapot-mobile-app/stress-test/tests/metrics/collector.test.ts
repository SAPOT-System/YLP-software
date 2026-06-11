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
});
