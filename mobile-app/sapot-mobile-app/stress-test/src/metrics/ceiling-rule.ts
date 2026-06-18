import { PhaseStats } from './collector';

export interface CeilingResult {
  /** Highest peer count where success rate ≥ threshold (0 when belowRange). */
  ceilingPeerCount: number;
  /** True when the ceiling equals the highest tested peer count — range may not cover the real limit. */
  openEnded: boolean;
  /** True when every lag-valid phase already failed the threshold, or no valid phases exist. */
  belowRange: boolean;
  /** Number of lag-valid phases considered. */
  validPhaseCount: number;
}

/** Success rate for a phase: connectedPeers / peerCount, or 0 when peerCount is 0. */
function successRate(phase: PhaseStats): number {
  return phase.peerCount > 0 ? phase.connectedPeers / phase.peerCount : 0;
}

/**
 * Returns the highest peer count whose lag-valid phase meets successThreshold (≥).
 *
 * - openEnded: all lag-valid phases passed — the real ceiling is higher than tested.
 * - belowRange: no lag-valid phase passed — ceiling is below the smallest tested peer count.
 */
export function determineCeiling(
  phases: PhaseStats[],
  { successThreshold = 0.95 }: { successThreshold?: number } = {},
): CeilingResult {
  const valid = phases.filter(p => p.lagValid);

  if (valid.length === 0) {
    return { ceilingPeerCount: 0, openEnded: false, belowRange: true, validPhaseCount: 0 };
  }

  const passing = valid.filter(p => successRate(p) >= successThreshold);

  if (passing.length === 0) {
    return {
      ceilingPeerCount: 0,
      openEnded: false,
      belowRange: true,
      validPhaseCount: valid.length,
    };
  }

  const ceilingPeerCount = Math.max(...passing.map(p => p.peerCount));
  const maxValidPeerCount = Math.max(...valid.map(p => p.peerCount));

  return {
    ceilingPeerCount,
    openEnded: ceilingPeerCount === maxValidPeerCount,
    belowRange: false,
    validPhaseCount: valid.length,
  };
}
