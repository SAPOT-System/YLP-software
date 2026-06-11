import { TestConfig, Phase } from './test-config';
import { MetricsCollector, PhaseStats, IperfStats } from '../metrics/collector';
import { NetworkSampler } from '../metrics/network-sampler';
import { computeNetworkStats, formatSaturationAnalysis } from '../metrics/reporter';
import { LanPeer } from '../peers/lan-peer';
import { WsPeer } from '../peers/ws-peer';
import { BasePeer } from '../peers/base-peer';
import { spawn } from 'child_process';

export class Orchestrator {
  constructor(
    private readonly config: TestConfig,
    private readonly collector: MetricsCollector,
    private readonly sampler: NetworkSampler,
  ) {}

  async run(): Promise<PhaseStats[]> {
    const results: PhaseStats[] = [];
    const transports: Array<'lan' | 'ws' | 'webrtc'> =
      this.config.mode === 'both' ? ['lan', 'ws'] : [this.config.mode];

    for (const transport of transports) {
      console.log(`\n=== Transport: ${transport.toUpperCase()} ===`);
      for (const phase of this.config.phases) {
        const phaseName = `${transport}-peers${phase.peerCount}-msg${phase.msgPerSec}${phase.iperfLoadMbps ? `-iperf${phase.iperfLoadMbps}M` : ''}`;
        console.log(`\n--- Phase: ${phaseName} ---`);
        this.collector.reset();
        this.sampler.reset();

        const peers = this.spawnPeers(transport, phase);
        const connectResults = await Promise.allSettled(peers.map(p => p.connect()));
        const failedConnects = connectResults.filter(r => r.status === 'rejected');
        if (failedConnects.length > 0) {
          console.error(`  [Error] ${failedConnects.length} peers failed to start their servers.`);
        }

        if (transport === 'ws') {
          const wsPeers = peers as WsPeer[];
          for (let i = 0; i < wsPeers.length; i++) {
            const nextIdx = (i + 1) % wsPeers.length;
            const targetId = wsPeers[nextIdx].userId;
            if (targetId) {
              wsPeers[i].setTarget(targetId);
            }
          }
        }

        if (transport === 'lan' && peers.length > 1) {
          const lanPeers = peers as LanPeer[];
          console.log(`  [LAN] Connecting ${lanPeers.length} peers in a ring topology...`);
          // Use '127.0.0.1' for peers on the same laptop to ensure they can connect
          const ringResults = await Promise.allSettled(
            lanPeers.map((p, i) =>
              p.connectTo('127.0.0.1', lanPeers[(i + 1) % lanPeers.length].port)
            )
          );
          const failedRing = ringResults.filter(r => r.status === 'rejected');
          if (failedRing.length > 0) {
            console.error(`  [Error] ${failedRing.length} peers failed to connect in the ring.`);
          }
        }

        await sleep(500);

        let iperfPromise: Promise<IperfStats | null> | undefined;
        if (phase.iperfLoadMbps !== undefined) {
          let targetIp: string | undefined;
          if (transport === 'lan') {
            targetIp = this.config.lan!.iperfTargetIp || this.config.lan!.hostIp;
          } else if (transport === 'ws') {
            try {
              targetIp = new URL(this.config.ws!.serverUrl).hostname;
            } catch {
              targetIp = undefined;
            }
          }
          if (targetIp) {
            console.log(`  [iperf] Measuring throughput/loss/delay to ${targetIp}...`);
            iperfPromise = runIperf(targetIp, phase.durationSec);
          }
        }

        const startMs = Date.now();
        this.sampler.start();
        peers.forEach(p => p.startSending(phase.msgPerSec));
        await sleep(phase.durationSec * 1000);
        peers.forEach(p => p.stopSending());
        this.sampler.stop();
        const endMs = Date.now();

        const iperfStats = iperfPromise
          ? await Promise.race([iperfPromise, sleep(10_000).then(() => null)])
          : null;

        if (iperfStats) {
          console.log(
            `  [iperf] ${iperfStats.throughputMbps.toFixed(1)} Mbps | ` +
            `loss ${iperfStats.lossPercent.toFixed(2)}% (${iperfStats.lostPackets}/${iperfStats.totalPackets}) | ` +
            `jitter ${iperfStats.jitterMs.toFixed(2)}ms`,
          );
        }

        await Promise.allSettled(peers.map(p => p.disconnect()));

        const msgStats = this.collector.computeStats(
          phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, startMs, endMs,
        );
        const netStats = computeNetworkStats(this.sampler.getSamples(), endMs - startMs);
        const stats: PhaseStats = {
          ...msgStats,
          throughputMbps: netStats.throughputMbps,
          packetLossPercent: netStats.packetLossPercent,
          rssiDbm: netStats.rssiDbm,
          linkSpeedMbps: netStats.linkSpeedMbps,
          iperfStats,
        };
        results.push(stats);
        printPhaseStats(stats);
      }
    }
    console.log('\n=== SATURATION ANALYSIS ===');
    console.log(formatSaturationAnalysis(results));
    return results;
  }

  private spawnPeers(transport: 'lan' | 'ws' | 'webrtc', phase: Phase): BasePeer[] {
    const peers: BasePeer[] = [];
    for (let i = 0; i < phase.peerCount; i++) {
      if (transport === 'lan') {
        const lan = this.config.lan!;
        peers.push(new LanPeer(`stress-lan-${i}`, i, lan.hostIp, lan.startPort + i, this.collector));
      } else {
        const ws = this.config.ws!;
        peers.push(new WsPeer(
          `${ws.accountPrefix}${i}`,
          i,
          ws.serverUrl,
          this.collector,
          5000,
          { username: `${ws.accountPrefix}${i}`, password: ws.password },
        ));
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

function runIperf(targetIp: string, durationSec: number): Promise<IperfStats | null> {
  return new Promise(resolve => {
    const args = ['-c', targetIp, '-u', '-b', '0', '-t', String(durationSec), '-J'];
    const proc = spawn('iperf3', args);
    let stdout = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on('error', (err) => {
      console.error(`  [iperf] Failed to start: ${err.message}`);
      resolve(null);
    });
    proc.on('close', () => {
      try {
        const json = JSON.parse(stdout) as Record<string, unknown>;
        const end = json['end'] as Record<string, unknown> | undefined;
        const sum = end?.['sum'] as Record<string, unknown> | undefined;
        if (!sum) { resolve(null); return; }
        resolve({
          throughputMbps: Math.round(((sum['bits_per_second'] as number) / 1_000_000) * 100) / 100,
          lossPercent: Math.round(((sum['lost_percent'] as number) ?? 0) * 100) / 100,
          jitterMs: Math.round(((sum['jitter_ms'] as number) ?? 0) * 100) / 100,
          lostPackets: (sum['lost_packets'] as number) ?? 0,
          totalPackets: (sum['packets'] as number) ?? 0,
        });
      } catch {
        resolve(null);
      }
    });
  });
}
