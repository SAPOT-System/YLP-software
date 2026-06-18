import { IperfStats } from './collector';

export interface LinkHealthThresholds {
  minThroughputMbps: number;
  maxLossPercent: number;
}

export interface LinkHealthResult {
  healthy: boolean;
  throughputMbps: number;
  lossPercent: number;
  reason: string | null;
}

const DEFAULT_THRESHOLDS: LinkHealthThresholds = {
  minThroughputMbps: 10,
  maxLossPercent: 1,
};

export function isLinkHealthy(
  baseline: IperfStats | null,
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

  if (baseline.throughputMbps <= thresholds.minThroughputMbps) {
    return {
      healthy: false,
      throughputMbps: baseline.throughputMbps,
      lossPercent: baseline.lossPercent,
      reason: `throughput ${baseline.throughputMbps} Mbps below ${thresholds.minThroughputMbps} Mbps threshold`,
    };
  }

  return {
    healthy: true,
    throughputMbps: baseline.throughputMbps,
    lossPercent: baseline.lossPercent,
    reason: null,
  };
}
