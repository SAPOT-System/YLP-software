export interface IperfStats {
  throughputMbps: number;
  lossPercent: number;
  jitterMs: number;
  lostPackets: number;
  totalPackets: number;
}

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
  throughputMbps: number;
  packetLossPercent: number;
  rssiDbm: number | null;
  linkSpeedMbps: number | null;
  iperfStats: IperfStats | null;
  iceEstablishP50Ms: number;
  iceEstablishP95Ms: number;
  iceEstablishMaxMs: number;
  connectionTimeouts: number;
  rtpPacketsSent: number;
  rtpPacketsLost: number;
  mediaEstablishP95Ms: number;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export class MetricsCollector {
  private sentCounts = new Map<string, number>();
  private latencySamples: number[] = [];
  private droppedCounts = new Map<string, number>();
  private ackCounts = new Map<string, number>();
  private connectionErrors = 0;
  private wsPeakQueueFills = 0;
  private iceEstablishSamples: number[] = [];
  private connectionTimeoutCount = 0;
  private rtpSentCount = 0;
  private rtpLostCount = 0;
  private mediaEstablishSamples: number[] = [];

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

  recordIceEstablish(_peerId: string, ms: number): void {
    this.iceEstablishSamples.push(ms);
  }

  recordConnectionTimeout(): void {
    this.connectionTimeoutCount++;
  }

  recordRtpSent(_peerId: string): void {
    this.rtpSentCount++;
  }

  recordRtpLost(_peerId: string): void {
    this.rtpLostCount++;
  }

  recordMediaEstablish(_peerId: string, ms: number): void {
    this.mediaEstablishSamples.push(ms);
  }

  reset(): void {
    this.sentCounts = new Map();
    this.latencySamples = [];
    this.droppedCounts = new Map();
    this.ackCounts = new Map();
    this.connectionErrors = 0;
    this.wsPeakQueueFills = 0;
    this.iceEstablishSamples = [];
    this.connectionTimeoutCount = 0;
    this.rtpSentCount = 0;
    this.rtpLostCount = 0;
    this.mediaEstablishSamples = [];
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
    const localPct = (p: number) => pct(sorted, p);
    const mean = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const variance =
      sorted.length > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1) : 0;

    const iceSorted = [...this.iceEstablishSamples].sort((a, b) => a - b);
    const mediaSorted = [...this.mediaEstablishSamples].sort((a, b) => a - b);

    return {
      phaseName,
      peerCount,
      msgPerSec,
      durationSec,
      totalSent,
      totalAcked,
      deliveryRate: totalSent > 0 ? totalAcked / totalSent : 0,
      droppedCount: totalDropped,
      p50Ms: localPct(50),
      p95Ms: localPct(95),
      p99Ms: localPct(99),
      jitterMs: Math.round(Math.sqrt(variance)),
      connectionErrors: this.connectionErrors,
      wsPeakQueueFills: this.wsPeakQueueFills,
      throughputMbps: 0,
      packetLossPercent: 0,
      rssiDbm: null,
      linkSpeedMbps: null,
      iperfStats: null,
      iceEstablishP50Ms: pct(iceSorted, 50),
      iceEstablishP95Ms: pct(iceSorted, 95),
      iceEstablishMaxMs: iceSorted.length > 0 ? iceSorted[iceSorted.length - 1] : 0,
      connectionTimeouts: this.connectionTimeoutCount,
      rtpPacketsSent: this.rtpSentCount,
      rtpPacketsLost: this.rtpLostCount,
      mediaEstablishP95Ms: pct(mediaSorted, 95),
    };
  }
}
