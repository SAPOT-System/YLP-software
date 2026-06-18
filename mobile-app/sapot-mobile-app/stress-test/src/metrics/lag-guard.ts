import { LagSample } from './event-loop-lag-sampler';

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function computeLagP95(samples: LagSample[]): number {
  const sorted = samples.map(s => s.lagMs).sort((a, b) => a - b);
  return pct(sorted, 95);
}

// Returns true when p95 lag ≤ thresholdMs (inclusive). Empty samples → true (no evidence of overload).
export function isPhaseLagValid(samples: LagSample[], thresholdMs: number): boolean {
  return computeLagP95(samples) <= thresholdMs;
}
