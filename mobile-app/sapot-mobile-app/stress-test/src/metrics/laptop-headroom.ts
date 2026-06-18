import { CeilingResult } from './ceiling-rule';

export type HeadroomVerdict = 'headroom-ok' | 'borderline' | 'insufficient' | 'undetermined';

export interface HeadroomResult {
  verdict: HeadroomVerdict;
  loopbackCeiling: number;
  phoneCeiling: number;
}

/**
 * Compares a loopback control ceiling to the phone ceiling.
 *
 * okMarginFactor (default 2.0): loopback/phone ≥ this → headroom-ok.
 * borderlineMarginFactor (default 1.5): loopback/phone ≥ this → borderline.
 *
 * Returns 'undetermined' when either ceiling is unavailable (belowRange with
 * ceilingPeerCount=0), preventing a false verdict.
 */
export function assessLaptopHeadroom(
  loopback: CeilingResult,
  phone: CeilingResult,
  {
    okMarginFactor = 2.0,
    borderlineMarginFactor = 1.5,
  }: { okMarginFactor?: number; borderlineMarginFactor?: number } = {},
): HeadroomResult {
  const lc = loopback.ceilingPeerCount;
  const pc = phone.ceilingPeerCount;

  if (loopback.validPhaseCount === 0 || phone.validPhaseCount === 0 || pc === 0) {
    return { verdict: 'undetermined', loopbackCeiling: lc, phoneCeiling: pc };
  }

  const ratio = lc / pc;

  let verdict: HeadroomVerdict;
  if (ratio >= okMarginFactor) {
    verdict = 'headroom-ok';
  } else if (ratio >= borderlineMarginFactor) {
    verdict = 'borderline';
  } else {
    verdict = 'insufficient';
  }

  return { verdict, loopbackCeiling: lc, phoneCeiling: pc };
}
