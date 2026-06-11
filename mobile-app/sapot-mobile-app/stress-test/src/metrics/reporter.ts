import * as fs from 'fs';
import * as path from 'path';
import { PhaseStats } from './collector';
import { NetworkSample } from './network-sampler';

export interface NetworkStats {
  throughputMbps: number;
  packetLossPercent: number;
  rssiDbm: number | null;
  linkSpeedMbps: number | null;
  interfaceRxMb: number;
  interfaceTxMb: number;
}

const LATENCY_SPIKE_MULTIPLIER     = 2;
const THROUGHPUT_PLATEAU_THRESHOLD = 0.10;
const PACKET_LOSS_THRESHOLD_PCT    = 1;
const DELIVERY_RATE_MIN            = 0.95;

export function computeNetworkStats(samples: NetworkSample[], durationMs: number): NetworkStats {
  if (samples.length < 2) {
    return {
      throughputMbps: 0, packetLossPercent: 0,
      rssiDbm: null, linkSpeedMbps: null, interfaceRxMb: 0, interfaceTxMb: 0,
    };
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const rxDelta = last.wlanRxBytes - first.wlanRxBytes;
  const txDelta = last.wlanTxBytes - first.wlanTxBytes;
  const totalBytes = rxDelta + txDelta;
  const durationSec = durationMs / 1000;
  const throughputMbps = (totalBytes * 8) / (durationSec * 1_000_000);
  const retransDelta = last.tcpRetransSegs - first.tcpRetransSegs;
  const totalSegments = Math.max(1, Math.ceil(totalBytes / 1460));
  const packetLossPercent = Math.min(100, (retransDelta / totalSegments) * 100);
  return {
    throughputMbps: Math.round(throughputMbps * 10) / 10,
    packetLossPercent: Math.round(packetLossPercent * 100) / 100,
    rssiDbm: last.rssiDbm,
    linkSpeedMbps: last.linkSpeedMbps,
    interfaceRxMb: Math.round(rxDelta / 100_000) / 10,
    interfaceTxMb: Math.round(txDelta / 100_000) / 10,
  };
}

export function formatTable(phases: PhaseStats[]): string {
  const hasIperf = phases.some(p => p.iperfStats !== null);

  const header = hasIperf
    ? 'Phase              | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter | Mbps  | Loss% | iMbps | iLoss%| iJitter'
    : 'Phase              | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter | Mbps  | Loss%';
  const sep = hasIperf
    ? '-------------------|-------|-------|-----------|---------|------|-------|--------|-------|-------|-------|-------|--------'
    : '-------------------|-------|-------|-----------|---------|------|-------|--------|-------|------';

  const rows = phases.map(p => {
    const name   = p.phaseName.padEnd(18);
    const peers  = String(p.peerCount).padStart(5);
    const rate   = String(p.msgPerSec).padStart(5);
    const del    = `${(p.deliveryRate * 100).toFixed(1)}%`.padStart(9);
    const drop   = String(p.droppedCount).padStart(7);
    const p50    = `${p.p50Ms}ms`.padStart(4);
    const p95    = `${p.p95Ms}ms`.padStart(5);
    const jitter = `${p.jitterMs}ms`.padStart(6);
    const mbps   = `${p.throughputMbps}`.padStart(5);
    const loss   = `${p.packetLossPercent}%`.padStart(5);
    const base = `${name} | ${peers} | ${rate} | ${del} | ${drop} | ${p50} | ${p95} | ${jitter} | ${mbps} | ${loss}`;
    if (!hasIperf) return base;
    const iMbps   = p.iperfStats ? `${p.iperfStats.throughputMbps}`.padStart(5)  : '   -';
    const iLoss   = p.iperfStats ? `${p.iperfStats.lossPercent}%`.padStart(6)    : '    -';
    const iJitter = p.iperfStats ? `${p.iperfStats.jitterMs}ms`.padStart(7)      : '      -';
    return `${base} | ${iMbps} | ${iLoss} | ${iJitter}`;
  });
  return [header, sep, ...rows].join('\n');
}

export function formatSaturationAnalysis(phases: PhaseStats[]): string {
  if (phases.length < 2) {
    return 'Not enough phases to determine saturation (need at least 2).';
  }

  const baseline = phases[0];
  const findings: string[] = [];

  for (let i = 1; i < phases.length; i++) {
    const p = phases[i];
    const prev = phases[i - 1];

    if (baseline.p95Ms > 0 && p.p95Ms > baseline.p95Ms * LATENCY_SPIKE_MULTIPLIER) {
      findings.push(`  [LATENCY SPIKE]      Phase "${p.phaseName}": p95 ${p.p95Ms}ms > ${LATENCY_SPIKE_MULTIPLIER}× baseline ${baseline.p95Ms}ms`);
    }

    const lossSource = p.iperfStats ?? null;
    const lossPercent = lossSource ? lossSource.lossPercent : p.packetLossPercent;
    const lossLabel   = lossSource ? 'iperf' : 'proc';
    if (lossPercent > PACKET_LOSS_THRESHOLD_PCT) {
      findings.push(`  [PACKET LOSS]        Phase "${p.phaseName}": loss ${lossPercent}% exceeds ${PACKET_LOSS_THRESHOLD_PCT}% threshold (${lossLabel})`);
    }

    if (p.deliveryRate < DELIVERY_RATE_MIN) {
      findings.push(`  [DELIVERY DROP]      Phase "${p.phaseName}": delivery ${(p.deliveryRate * 100).toFixed(1)}% < ${DELIVERY_RATE_MIN * 100}%`);
    }

    if (
      p.peerCount > prev.peerCount &&
      prev.throughputMbps >= 1.0 &&
      p.throughputMbps > 0
    ) {
      const growth = (p.throughputMbps - prev.throughputMbps) / prev.throughputMbps;
      if (growth < THROUGHPUT_PLATEAU_THRESHOLD) {
        findings.push(`  [THROUGHPUT PLATEAU] Phase "${p.phaseName}": only ${(growth * 100).toFixed(1)}% growth despite +${p.peerCount - prev.peerCount} peers`);
      }
    }
  }

  if (findings.length === 0) {
    return 'No saturation detected within test range — increase peer count.';
  }
  return `Saturation signals detected:\n${findings.join('\n')}`;
}

export function writeResults(
  outputDir: string,
  transport: string,
  phases: PhaseStats[],
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = path.join(outputDir, `results-${transport}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify({ transport, phases }, null, 2));
  console.log(`\nResults written to ${filename}`);
}

export function formatWebrtcBlock(stats: PhaseStats, peerCount: number): string {
  const pairs = Math.floor(peerCount / 2);
  // connectionErrors is aggregated per-peer (one per failed peer, including
  // timeouts), so connection success is measured against peerCount, not pairs.
  const connected = Math.max(0, peerCount - stats.connectionErrors);
  const successPct = peerCount > 0 ? ((connected / peerCount) * 100).toFixed(0) : '0';

  const lines: string[] = [
    'WebRTC Connections',
    `  pairs attempted     : ${pairs}`,
    `  peers connected     : ${connected}/${peerCount}  (${successPct}%)`,
    `  timed out (peers)   : ${stats.connectionTimeouts}`,
    `  ICE establish p50   : ${stats.iceEstablishP50Ms}ms`,
    `  ICE establish p95   : ${stats.iceEstablishP95Ms}ms`,
    `  ICE establish max   : ${stats.iceEstablishMaxMs}ms`,
    '',
    'Chat (RTCDataChannel)',
    `  sent / acked / dropped  : ${stats.totalSent} / ${stats.totalAcked} / ${stats.droppedCount}`,
    `  write latency p95       : ${stats.p95Ms}ms`,
  ];

  if (stats.rtpPacketsSent > 0) {
    const lossRate = ((stats.rtpPacketsLost / stats.rtpPacketsSent) * 100).toFixed(1);
    lines.push(
      '',
      'Call (media track)',
      `  RTP packets sent        : ${stats.rtpPacketsSent}`,
      `  RTP packets lost        : ${stats.rtpPacketsLost}  (${lossRate}%)`,
      `  media establish p95     : ${stats.mediaEstablishP95Ms}ms`,
    );
  }

  return lines.join('\n');
}
