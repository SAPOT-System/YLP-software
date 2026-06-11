import { TestConfig, Phase } from './test-config';
import { MetricsCollector, PhaseStats } from '../metrics/collector';
import { NetworkSampler } from '../metrics/network-sampler';
import { LanPeer } from '../peers/lan-peer';
import { WsPeer } from '../peers/ws-peer';
import { BasePeer } from '../peers/base-peer';
import { buildWsUrl, fetchJwt } from '../protocol/ws-protocol';

export class Orchestrator {
  constructor(
    private readonly config: TestConfig,
    private readonly collector: MetricsCollector,
    private readonly sampler: NetworkSampler,
  ) {}

  async run(): Promise<PhaseStats[]> {
    const results: PhaseStats[] = [];
    const transports: Array<'lan' | 'ws'> =
      this.config.mode === 'both' ? ['lan', 'ws'] : [this.config.mode];

    for (const transport of transports) {
      console.log(`\n=== Transport: ${transport.toUpperCase()} ===`);
      for (const phase of this.config.phases) {
        const phaseName = `${transport}-peers${phase.peerCount}-msg${phase.msgPerSec}`;
        console.log(`\n--- Phase: ${phaseName} ---`);
        this.collector.reset();
        this.sampler.reset();

        const peers = await this.spawnPeers(transport, phase);
        await Promise.allSettled(peers.map(p => p.connect()));
        await sleep(500);

        const startMs = Date.now();
        this.sampler.start();
        peers.forEach(p => p.startSending(phase.msgPerSec));
        await sleep(phase.durationSec * 1000);
        peers.forEach(p => p.stopSending());
        this.sampler.stop();
        const endMs = Date.now();

        await Promise.allSettled(peers.map(p => p.disconnect()));

        const stats = this.collector.computeStats(
          phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, startMs, endMs,
        );
        results.push(stats);
        printPhaseStats(stats);
      }
    }
    return results;
  }

  private async spawnPeers(transport: 'lan' | 'ws', phase: Phase): Promise<BasePeer[]> {
    const peers: BasePeer[] = [];
    for (let i = 0; i < phase.peerCount; i++) {
      if (transport === 'lan') {
        const lan = this.config.lan!;
        peers.push(new LanPeer(`stress-lan-${i}`, i, lan.hostIp, lan.startPort + i, this.collector));
      } else {
        const ws = this.config.ws!;
        const wsUrl = ws.serverUrl.startsWith('ws')
          ? ws.serverUrl
          : buildWsUrl(ws.serverUrl, await fetchJwt(ws.serverUrl, `${ws.accountPrefix}${i}`, `stress_pass_${i}`));
        peers.push(new WsPeer(`${ws.accountPrefix}${i}`, i, wsUrl, this.collector));
      }
    }
    return peers;
  }
}

function printPhaseStats(stats: PhaseStats): void {
  const rate = (stats.deliveryRate * 100).toFixed(1);
  console.log(`  Sent: ${stats.totalSent} | Acked: ${stats.totalAcked} (${rate}%) | Dropped: ${stats.droppedCount}`);
  console.log(`  p50/p95/p99: ${stats.p50Ms}ms / ${stats.p95Ms}ms / ${stats.p99Ms}ms | Jitter: ${stats.jitterMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
