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
  // Local send-queue backpressure across peers, NOT network loss.
  txQueueOverflowCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  // Standard deviation of data-channel RTT samples (NOT RFC-3550 jitter).
  rttStddevMs: number;
  connectionErrors: number;
  throughputMbps: number;
  rssiDbm: number | null;
  linkSpeedMbps: number | null;
  // Stage 1: clean link baseline (no stress traffic). Stage 2: link under stress load.
  iperfBaseline: IperfStats | null;
  iperfLoad: IperfStats | null;
  iceEstablishP50Ms: number;
  iceEstablishP95Ms: number;
  iceEstablishMaxMs: number;
  connectionTimeouts: number;
  rtpPacketsSent: number;
  audioEstablishP95Ms: number;
  videoEstablishP95Ms: number;
  dcEstablishP95Ms: number;
  connectedPeers: number;
  // Phone discovery metrics (tcp-signaled star mode only).
  discoveryCompleteness: number;
  discoveryP50Ms: number;
  discoveryP95Ms: number;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export class MetricsCollector {
  private sentCounts = new Map<string, number>();
  private latencySamples: number[] = [];
  private txQueueOverflowCounts = new Map<string, number>();
  private ackCounts = new Map<string, number>();
  private connectionErrors = 0;
  private iceEstablishSamples: number[] = [];
  private connectionTimeoutCount = 0;
  private rtpSentCount = 0;
  private audioEstablishSamples: number[] = [];
  private videoEstablishSamples: number[] = [];
  private dcEstablishSamples: number[] = [];
  // peerId → latency of first probe (ms from advertise to probe)
  private discoveryProbes = new Map<string, number>();

  recordSent(peerId: string, _atMs: number): void {
    this.sentCounts.set(peerId, (this.sentCounts.get(peerId) ?? 0) + 1);
  }

  recordAcked(peerId: string, _sentAtMs: number, latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    this.ackCounts.set(peerId, (this.ackCounts.get(peerId) ?? 0) + 1);
  }

  recordTxQueueOverflow(peerId: string): void {
    this.txQueueOverflowCounts.set(peerId, (this.txQueueOverflowCounts.get(peerId) ?? 0) + 1);
  }

  recordConnectionError(): void { this.connectionErrors++; }

  recordIceEstablish(_peerId: string, ms: number): void {
    this.iceEstablishSamples.push(ms);
  }

  recordConnectionTimeout(): void {
    this.connectionTimeoutCount++;
  }

  recordRtpSent(_peerId: string): void {
    this.rtpSentCount++;
  }

  recordAudioEstablish(_peerId: string, ms: number): void {
    this.audioEstablishSamples.push(ms);
  }

  recordVideoEstablish(_peerId: string, ms: number): void {
    this.videoEstablishSamples.push(ms);
  }

  recordDcEstablish(_peerId: string, ms: number): void {
    this.dcEstablishSamples.push(ms);
  }

  recordDiscoveryProbe(peerId: string, latencyMs: number): void {
    if (!this.discoveryProbes.has(peerId)) {
      this.discoveryProbes.set(peerId, latencyMs);
    }
  }

  reset(): void {
    this.sentCounts = new Map();
    this.latencySamples = [];
    this.txQueueOverflowCounts = new Map();
    this.ackCounts = new Map();
    this.connectionErrors = 0;
    this.iceEstablishSamples = [];
    this.connectionTimeoutCount = 0;
    this.rtpSentCount = 0;
    this.audioEstablishSamples = [];
    this.videoEstablishSamples = [];
    this.dcEstablishSamples = [];
    this.discoveryProbes = new Map();
  }

  computeStats(
    phaseName: string,
    peerCount: number,
    msgPerSec: number,
    durationSec: number,
    connectedPeers: number,
  ): PhaseStats {
    let totalSent = 0;
    for (const v of this.sentCounts.values()) totalSent += v;
    let totalAcked = 0;
    for (const v of this.ackCounts.values()) totalAcked += v;
    let totalTxQueueOverflow = 0;
    for (const v of this.txQueueOverflowCounts.values()) totalTxQueueOverflow += v;

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const localPct = (p: number) => pct(sorted, p);
    const mean = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const variance =
      sorted.length > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1) : 0;

    const iceSorted = [...this.iceEstablishSamples].sort((a, b) => a - b);
    const audioSorted = [...this.audioEstablishSamples].sort((a, b) => a - b);
    const videoSorted = [...this.videoEstablishSamples].sort((a, b) => a - b);
    const dcSorted = [...this.dcEstablishSamples].sort((a, b) => a - b);
    const discoverySorted = [...this.discoveryProbes.values()].sort((a, b) => a - b);

    return {
      phaseName,
      peerCount,
      msgPerSec,
      durationSec,
      totalSent,
      totalAcked,
      deliveryRate: totalSent > 0 ? totalAcked / totalSent : 0,
      txQueueOverflowCount: totalTxQueueOverflow,
      p50Ms: localPct(50),
      p95Ms: localPct(95),
      p99Ms: localPct(99),
      rttStddevMs: Math.round(Math.sqrt(variance)),
      connectionErrors: this.connectionErrors,
      throughputMbps: 0,
      rssiDbm: null,
      linkSpeedMbps: null,
      iperfBaseline: null,
      iperfLoad: null,
      iceEstablishP50Ms: pct(iceSorted, 50),
      iceEstablishP95Ms: pct(iceSorted, 95),
      iceEstablishMaxMs: iceSorted.length > 0 ? iceSorted[iceSorted.length - 1] : 0,
      connectionTimeouts: this.connectionTimeoutCount,
      rtpPacketsSent: this.rtpSentCount,
      audioEstablishP95Ms: pct(audioSorted, 95),
      videoEstablishP95Ms: pct(videoSorted, 95),
      dcEstablishP95Ms: pct(dcSorted, 95),
      connectedPeers,
      discoveryCompleteness: peerCount > 0 ? this.discoveryProbes.size / peerCount : 0,
      discoveryP50Ms: pct(discoverySorted, 50),
      discoveryP95Ms: pct(discoverySorted, 95),
    };
  }
}
