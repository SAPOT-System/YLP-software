import { isPhaseLagValid, computeLagP95 } from '@/metrics/lag-guard';
import { LagSample } from '@/metrics/event-loop-lag-sampler';

function samples(lags: number[]): LagSample[] {
  return lags.map((lagMs, i) => ({ timestamp: i * 100, lagMs }));
}

describe('computeLagP95', () => {
  it('returns 0 for empty samples', () => {
    expect(computeLagP95([])).toBe(0);
  });

  it('returns the 95th percentile of lag values', () => {
    // 100 samples: values 1..100; p95 = 95
    const s = samples(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(computeLagP95(s)).toBe(95);
  });

  it('returns the single value for a one-sample array', () => {
    expect(computeLagP95(samples([42]))).toBe(42);
  });
});

describe('isPhaseLagValid', () => {
  it('returns true when all samples are below threshold', () => {
    expect(isPhaseLagValid(samples([1, 2, 3, 4, 5]), 50)).toBe(true);
  });

  it('returns true when p95 equals threshold (inclusive boundary)', () => {
    // 20 samples: p95 lands on value 50
    const s = samples(Array.from({ length: 20 }, (_, i) => i + 1).concat([50]));
    const p95 = computeLagP95(s);
    expect(isPhaseLagValid(s, p95)).toBe(true);
  });

  it('returns false when p95 exceeds threshold', () => {
    // 19 samples: 18 low (5ms) + one spike (100ms). p95 index = ceil(0.95*19)-1 = 18 → 100ms
    const s = samples([...Array(18).fill(5), 100]);
    expect(isPhaseLagValid(s, 50)).toBe(false);
  });

  it('returns true for empty samples (no evidence of overload)', () => {
    expect(isPhaseLagValid([], 50)).toBe(true);
  });

  it('respects a custom threshold', () => {
    const s = samples([30, 40, 50, 60, 70, 80, 90, 100]);
    expect(isPhaseLagValid(s, 10)).toBe(false);
    expect(isPhaseLagValid(s, 100)).toBe(true);
  });
});
