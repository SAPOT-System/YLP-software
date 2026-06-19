import { IperfStats } from './collector';

export interface LinkHealthThresholds {
  minThroughputMbps: number;
  maxLossPercent: number;
  maxDegradationFactor: number;
}

export interface LinkHealthResult {
  healthy: boolean;
  throughputMbps: number;
  lossPercent: number;
  reason: string | null;
}

const DEFAULT_THRESHOLDS: LinkHealthThresholds = {
  minThroughputMbps: 2,
  maxLossPercent: 1,
  maxDegradationFactor: 0.15,
};

export function isLinkHealthy(
  baseline: IperfStats | null,
  underLoad: IperfStats | null = null,
  thresholds: LinkHealthThresholds = DEFAULT_THRESHOLDS,
): LinkHealthResult {
  if (!baseline) {
    return { healthy: true, throughputMbps: 0, lossPercent: 0, reason: null };
  }

  if (baseline.lossPercent >= thresholds.maxLossPercent) {
    return {
      healthy: false,
      throughputMbps: baseline.throughputMbps,
      lossPercent: baseline.lossPercent,
      reason: `loss ${baseline.lossPercent}% exceeds ${thresholds.maxLossPercent}% threshold`,
    };
  }

  if (underLoad !== null) {
    if (underLoad.throughputMbps <= thresholds.minThroughputMbps) {
      return {
        healthy: false,
        throughputMbps: baseline.throughputMbps,
        lossPercent: baseline.lossPercent,
        reason: `under-load throughput ${underLoad.throughputMbps} Mbps at or below ${thresholds.minThroughputMbps} Mbps floor`,
      };
    }
    if (baseline.throughputMbps > 0) {
      const drop = (baseline.throughputMbps - underLoad.throughputMbps) / baseline.throughputMbps;
      if (drop > thresholds.maxDegradationFactor) {
        const pct = Math.round(drop * 100);
        const factorPct = Math.round(thresholds.maxDegradationFactor * 100);
        return {
          healthy: false,
          throughputMbps: baseline.throughputMbps,
          lossPercent: baseline.lossPercent,
          reason: `under-load ${underLoad.throughputMbps} Mbps is ${pct}% below baseline ${baseline.throughputMbps} Mbps (>${factorPct}% threshold)`,
        };
      }
    }
  } else {
    if (baseline.throughputMbps <= thresholds.minThroughputMbps) {
      return {
        healthy: false,
        throughputMbps: baseline.throughputMbps,
        lossPercent: baseline.lossPercent,
        reason: `throughput ${baseline.throughputMbps} Mbps at or below ${thresholds.minThroughputMbps} Mbps threshold`,
      };
    }
  }

  return {
    healthy: true,
    throughputMbps: baseline.throughputMbps,
    lossPercent: baseline.lossPercent,
    reason: null,
  };
}
