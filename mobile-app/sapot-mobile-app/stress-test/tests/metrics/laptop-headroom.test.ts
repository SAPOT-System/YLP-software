import { assessLaptopHeadroom } from '@/metrics/laptop-headroom';
import { CeilingResult } from '@/metrics/ceiling-rule';

function ceiling(overrides: Partial<CeilingResult>): CeilingResult {
  return {
    ceilingPeerCount: 0,
    openEnded: false,
    belowRange: false,
    validPhaseCount: 1,
    ...overrides,
  };
}

describe('assessLaptopHeadroom', () => {
  it('headroom-ok when loopback is well above phone (default 2× margin)', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 20 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('headroom-ok');
    expect(result.loopbackCeiling).toBe(20);
    expect(result.phoneCeiling).toBe(8);
  });

  it('headroom-ok at exactly 2× margin (inclusive boundary)', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 16 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('headroom-ok');
  });

  it('borderline when ratio is between 1.5× and 2×', () => {
    // 12/8 = 1.5 exactly → borderline (inclusive lower boundary)
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 12 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('borderline');
  });

  it('borderline just below 2× (ratio 1.75)', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 14 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('borderline');
  });

  it('insufficient when ratio is below 1.5×', () => {
    // 10/8 = 1.25 → insufficient
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 10 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('insufficient');
  });

  it('insufficient when loopback ceiling equals phone ceiling', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 8 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('insufficient');
  });

  it('insufficient when loopback ceiling is below phone ceiling', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 4 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('insufficient');
  });

  it('undetermined when loopback has no valid phases', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 0, belowRange: true, validPhaseCount: 0 }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('undetermined');
  });

  it('undetermined when phone has no valid phases', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 20 }),
      ceiling({ ceilingPeerCount: 0, belowRange: true, validPhaseCount: 0 }),
    );
    expect(result.verdict).toBe('undetermined');
  });

  it('undetermined when phone ceiling is 0 (below range but has valid phases)', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 20 }),
      ceiling({ ceilingPeerCount: 0, belowRange: true, validPhaseCount: 2 }),
    );
    expect(result.verdict).toBe('undetermined');
  });

  it('custom okMarginFactor honored', () => {
    // With okMarginFactor=1.5: 12/8=1.5 ≥ 1.5 → headroom-ok instead of borderline
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 12 }),
      ceiling({ ceilingPeerCount: 8 }),
      { okMarginFactor: 1.5 },
    );
    expect(result.verdict).toBe('headroom-ok');
  });

  it('custom borderlineMarginFactor honored', () => {
    // borderlineMarginFactor=1.1: 12/8=1.5 ≥ 1.1 → borderline (not insufficient)
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 12 }),
      ceiling({ ceilingPeerCount: 8 }),
      { okMarginFactor: 2.0, borderlineMarginFactor: 1.1 },
    );
    expect(result.verdict).toBe('borderline');
  });

  it('openEnded loopback ceiling still returns ok verdict when ratio qualifies', () => {
    const result = assessLaptopHeadroom(
      ceiling({ ceilingPeerCount: 20, openEnded: true }),
      ceiling({ ceilingPeerCount: 8 }),
    );
    expect(result.verdict).toBe('headroom-ok');
  });
});
