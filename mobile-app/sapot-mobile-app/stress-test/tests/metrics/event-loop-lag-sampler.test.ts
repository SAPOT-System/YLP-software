import { EventLoopLagSampler } from '@/metrics/event-loop-lag-sampler';

describe('EventLoopLagSampler', () => {
  it('collects at least one sample during a short window', async () => {
    const sampler = new EventLoopLagSampler();
    sampler.start(50);
    await new Promise(res => setTimeout(res, 200));
    sampler.stop();
    expect(sampler.getSamples().length).toBeGreaterThan(0);
  });

  it('all samples have non-negative lagMs', async () => {
    const sampler = new EventLoopLagSampler();
    sampler.start(50);
    await new Promise(res => setTimeout(res, 200));
    sampler.stop();
    for (const s of sampler.getSamples()) {
      expect(s.lagMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('reset clears all samples', async () => {
    const sampler = new EventLoopLagSampler();
    sampler.start(50);
    await new Promise(res => setTimeout(res, 200));
    sampler.stop();
    sampler.reset();
    expect(sampler.getSamples()).toHaveLength(0);
  });

  it('getSamples returns a copy (mutations do not affect internal state)', async () => {
    const sampler = new EventLoopLagSampler();
    sampler.start(50);
    await new Promise(res => setTimeout(res, 200));
    sampler.stop();
    const copy = sampler.getSamples();
    copy.push({ timestamp: 0, lagMs: 999 });
    expect(sampler.getSamples().length).toBe(copy.length - 1);
  });
});
