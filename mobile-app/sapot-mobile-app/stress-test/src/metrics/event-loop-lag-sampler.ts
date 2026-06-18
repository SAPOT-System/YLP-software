export interface LagSample {
  timestamp: number;
  lagMs: number;
}

export class EventLoopLagSampler {
  private samples: LagSample[] = [];
  private timer?: NodeJS.Timeout;

  start(pollMs = 100): void {
    let expected = Date.now() + pollMs;
    this.timer = setInterval(() => {
      const now = Date.now();
      const lagMs = Math.max(0, now - expected);
      this.samples.push({ timestamp: now, lagMs });
      expected = now + pollMs;
    }, pollMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  reset(): void {
    this.samples = [];
  }

  getSamples(): LagSample[] {
    return [...this.samples];
  }
}
