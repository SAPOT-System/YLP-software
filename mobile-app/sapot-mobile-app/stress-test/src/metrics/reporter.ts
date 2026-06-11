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
  const header = 'Phase              | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter';
  const sep    = '-------------------|-------|-------|-----------|---------|------|-------|-------';
  const rows = phases.map(p => {
    const name   = p.phaseName.padEnd(18);
    const peers  = String(p.peerCount).padStart(5);
    const rate   = String(p.msgPerSec).padStart(5);
    const del    = `${(p.deliveryRate * 100).toFixed(1)}%`.padStart(9);
    const drop   = String(p.droppedCount).padStart(7);
    const p50    = `${p.p50Ms}ms`.padStart(4);
    const p95    = `${p.p95Ms}ms`.padStart(5);
    const jitter = `${p.jitterMs}ms`.padStart(5);
    return `${name} | ${peers} | ${rate} | ${del} | ${drop} | ${p50} | ${p95} | ${jitter}`;
  });
  return [header, sep, ...rows].join('\n');
}

export function writeResults(
  outputDir: string,
  transport: string,
  phases: PhaseStats[],
  networkStats: NetworkStats,
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = path.join(outputDir, `results-${transport}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify({ transport, phases, networkStats }, null, 2));
  console.log(`\nResults written to ${filename}`);
}
