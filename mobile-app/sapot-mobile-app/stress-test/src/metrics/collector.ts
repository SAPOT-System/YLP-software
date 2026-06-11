export interface PhaseStats {
  phaseName: string;
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
  totalSent: number;
  totalAcked: number;
  deliveryRate: number;
  droppedCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  jitterMs: number;
  connectionErrors: number;
  wsPeakQueueFills: number;
}

export class MetricsCollector {
  private sentCounts = new Map<string, number>();
  private latencySamples: number[] = [];
  private droppedCounts = new Map<string, number>();
  private ackCounts = new Map<string, number>();
  private connectionErrors = 0;
  private wsPeakQueueFills = 0;

  recordSent(peerId: string, _atMs: number): void {
    this.sentCounts.set(peerId, (this.sentCounts.get(peerId) ?? 0) + 1);
  }

  recordAcked(peerId: string, _sentAtMs: number, latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    this.ackCounts.set(peerId, (this.ackCounts.get(peerId) ?? 0) + 1);
  }

  recordDropped(peerId: string): void {
    this.droppedCounts.set(peerId, (this.droppedCounts.get(peerId) ?? 0) + 1);
  }

  recordConnectionError(): void { this.connectionErrors++; }
  recordQueueFill(): void { this.wsPeakQueueFills++; }

  reset(): void {
    this.sentCounts = new Map();
    this.latencySamples = [];
    this.droppedCounts = new Map();
    this.ackCounts = new Map();
    this.connectionErrors = 0;
    this.wsPeakQueueFills = 0;
  }

  computeStats(
    phaseName: string,
    peerCount: number,
    msgPerSec: number,
    durationSec: number,
    _startMs: number,
    _endMs: number,
  ): PhaseStats {
    let totalSent = 0;
    for (const v of this.sentCounts.values()) totalSent += v;
    let totalAcked = 0;
    for (const v of this.ackCounts.values()) totalAcked += v;
    let totalDropped = 0;
    for (const v of this.droppedCounts.values()) totalDropped += v;

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const pct = (p: number) => {
      if (sorted.length === 0) return 0;
      return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
    };
    const mean = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const variance =
      sorted.length > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1) : 0;

    return {
      phaseName,
      peerCount,
      msgPerSec,
      durationSec,
      totalSent,
      totalAcked,
      deliveryRate: totalSent > 0 ? totalAcked / totalSent : 0,
      droppedCount: totalDropped,
      p50Ms: pct(50),
      p95Ms: pct(95),
      p99Ms: pct(99),
      jitterMs: Math.round(Math.sqrt(variance)),
      connectionErrors: this.connectionErrors,
      wsPeakQueueFills: this.wsPeakQueueFills,
    };
  }
}
