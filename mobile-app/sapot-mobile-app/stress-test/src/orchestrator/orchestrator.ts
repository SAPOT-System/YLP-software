import { TestConfig, Phase } from "./test-config";
import { MetricsCollector, PhaseStats, IperfStats } from "../metrics/collector";
import { NetworkSampler } from "../metrics/network-sampler";
import { EventLoopLagSampler } from "../metrics/event-loop-lag-sampler";
import { computeLagP95, isPhaseLagValid } from "../metrics/lag-guard";
import {
  computeNetworkStats,
  formatSaturationAnalysis,
  formatWebrtcBlock,
} from "../metrics/reporter";
import { TcpSignaledWrtcPeer } from "../peers/tcp-signaled-wrtc-peer";
import { WsSignaledWrtcPeer } from "../peers/ws-signaled-wrtc-peer";
import { WsStarPeer } from "../peers/ws-star-peer";
import { spawn } from "child_process";
import { discoverPhoneTarget, PhoneTarget } from "../discovery/adb-runner";

export class Orchestrator {
  // Real link capacity (Mbps) discovered by a TCP probe, calibrated once per transport
  // at baseline and reused to derive the UDP offered load for that transport's phases.
  private calibratedCapacityMbps: number | null = null;

  constructor(
    private readonly config: TestConfig,
    private readonly collector: MetricsCollector,
    private readonly sampler: NetworkSampler,
    private readonly lagSampler: EventLoopLagSampler = new EventLoopLagSampler(),
    private readonly phoneDiscovery: () => Promise<PhoneTarget> = discoverPhoneTarget,
  ) {}

  async run(): Promise<PhaseStats[]> {
    const results: PhaseStats[] = [];

    if (this.config.mode === "tcp-signaled") {
      const lan = this.config.lan!;
      if (lan.adbDiscovery) {
        console.log('\nDiscovering phone target via adb...');
        const target = await this.phoneDiscovery();
        lan.phoneIp = target.ip;
        lan.phonePort = target.port;
        lan.phoneUserId = target.userId;
        console.log(`  phone: ${target.ip}:${target.port}  userId: ${target.userId}`);
      }
      const isStarMode = !!lan.phoneIp;
      const iperfTarget = lan.iperfTargetIp || (isStarMode ? lan.phoneIp : lan.hostIp);
      const iperfBaseline = await this.measureBaseline(iperfTarget || undefined);
      for (const phase of this.config.phases) {
        this.collector.reset();
        this.sampler.reset();
        this.lagSampler.reset();
        const peers = this.createTcpSignaledPeers(phase);

        if (isStarMode) {
          // Star mode: connect() dials the phone directly for each peer.
          console.log(
            `\n[tcp-signaled/star] phase: ${phase.peerCount} peers → phone at ${lan.phoneIp}:${lan.phonePort}`
          );
          const connectResults = await Promise.allSettled(peers.map((p) => p.connect()));
          const failed = connectResults.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          );
          if (failed.length > 0) {
            console.error(`  [Error] ${failed.length} peers failed to connect to phone:`);
            for (const f of failed) console.error(`    - ${describeConnectError(f.reason)}`);
          }
        } else {
          // Pair mode: start servers first, then wire offerer→answerer via loopback.
          await Promise.allSettled(peers.map((p) => p.connect()));
          console.log(
            `\n[tcp-signaled] phase: ${phase.peerCount} peers, ${phase.peerCount / 2} pairs`
          );
          const connectResults = await Promise.allSettled(
            peers
              .filter((_, i) => i % 2 === 0)
              .map((offerer, idx) => offerer.connectTo("127.0.0.1", peers[idx * 2 + 1].port))
          );
          const failedConnects = connectResults.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          );
          if (failedConnects.length > 0) {
            console.error(`  [Error] ${failedConnects.length} pairs failed to negotiate:`);
            for (const f of failedConnects) console.error(`    - ${describeConnectError(f.reason)}`);
          }
        }

        const iperfPromise = this.startIperf(phase, iperfTarget || undefined);

        const startMs = Date.now();
        this.sampler.start();
        this.lagSampler.start();
        peers.forEach((p) => p.startSending(phase.msgPerSec, phase.totalMessages));
        await sleep(phase.durationSec * 1000);
        peers.forEach((p) => p.stopSending());
        const connectedPeers = peers.filter((p) => p.getMetrics().connectedAtPhaseEnd).length;
        this.sampler.stop();
        this.lagSampler.stop();
        const endMs = Date.now();

        const iperfLoad = await this.awaitIperf(iperfPromise);
        await Promise.allSettled(peers.map((p) => p.disconnect()));

        const modeLabel = isStarMode ? "tcp-star" : "tcp-signaled";
        const phaseName = `${modeLabel}-${phase.peerCount}p${
          phase.runIperf && iperfTarget ? `-iperf` : ""
        }`;
        const netStats = computeNetworkStats(this.sampler.getSamples(), endMs - startMs);
        const lagSamples = this.lagSampler.getSamples();
        const lagThresholdMs = this.config.lagThresholdMs ?? 50;
        const msgStats = this.collector.computeStats(
          phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, connectedPeers
        );
        const stats: PhaseStats = {
          ...msgStats,
          throughputMbps: netStats.throughputMbps,
          rssiDbm: netStats.rssiDbm,
          linkSpeedMbps: netStats.linkSpeedMbps,
          iperfBaseline,
          iperfLoad,
          lagP95Ms: computeLagP95(lagSamples),
          lagValid: isPhaseLagValid(lagSamples, lagThresholdMs),
        };
        printPhaseStats(stats);
        console.log(formatWebrtcBlock(stats));
        results.push(stats);
      }
    }

    if (this.config.mode === "ws-signaled") {
      const ws = this.config.ws!;
      const isStarMode = !!ws.phoneUserId;
      let iperfTarget: string | undefined;
      try {
        iperfTarget = ws.iperfTargetIp || new URL(ws.serverUrl).hostname;
      } catch { /* invalid url */ }
      const iperfBaseline = await this.measureBaseline(iperfTarget);
      for (const phase of this.config.phases) {
        this.collector.reset();
        this.sampler.reset();
        this.lagSampler.reset();

        let peers: WsSignaledWrtcPeer[] | WsStarPeer[];

        if (isStarMode) {
          // Star mode: all peers target the phone.
          const starPeers = this.createWsStarPeers(phase);
          peers = starPeers;

          const connectResults = await Promise.allSettled(starPeers.map((p) => p.connect()));
          const failedAuth = connectResults.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          );
          if (failedAuth.length > 0) {
            console.error(`  [Error] ${failedAuth.length} peers failed to authenticate:`);
            for (const f of failedAuth) console.error(`    - ${describeConnectError(f.reason)}`);
          }

          console.log(
            `\n[ws-star] phase: ${phase.peerCount} peers → phone ${ws.phoneUserId}`
          );
          await Promise.allSettled(starPeers.map((p) => p.negotiate()));
        } else {
          // Pair mode: peers negotiate with each other.
          const signaledPeers = this.createWsSignaledPeers(phase);
          peers = signaledPeers;

          const connectResults = await batchedSettle(signaledPeers, (p) => p.connect(), 10, 400);
          const failedAuth = connectResults.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          );
          if (failedAuth.length > 0) {
            console.error(`  [Error] ${failedAuth.length} peers failed to authenticate:`);
            for (const f of failedAuth) console.error(`    - ${describeConnectError(f.reason)}`);
          }

          console.log(
            `\n[ws-signaled] phase: ${phase.peerCount} peers, ${phase.peerCount / 2} pairs`
          );

          // Wait for server-side queue drains before checking visibility.
          await sleep(3000);

          // Ensure each pair lands on the same server worker — multi-worker gunicorn
          // keeps separate in-memory active_connections per process, so cross-worker
          // relay silently fails. All pairs are checked and retried in parallel.
          const MAX_COLOCATION_ROUNDS = 20;
          let unresolved = signaledPeers
            .map((_, i) => i)
            .filter((i) => i % 2 === 0 && i + 1 < signaledPeers.length)
            .filter((i) => !!(signaledPeers[i].userId && signaledPeers[i + 1].userId));

          for (let round = 0; round < MAX_COLOCATION_ROUNDS && unresolved.length > 0; round++) {
            const checks = await Promise.all(
              unresolved.map(async (i) => {
                const visible = await signaledPeers[i].getVisiblePeerIds();
                return { i, ok: visible.includes(signaledPeers[i + 1].userId!) };
              })
            );
            unresolved = checks.filter((c) => !c.ok).map((c) => c.i);
            if (unresolved.length === 0) break;
            if (round < MAX_COLOCATION_ROUNDS - 1) {
              console.log(
                `  [ws-signaled] ${unresolved.length} pair(s) on different workers — reconnecting answerers (round ${round + 1})...`
              );
              await batchedSettle(
                unresolved.map((i) => signaledPeers[i + 1]),
                (p) => p.reconnect(),
                8,
                300,
              );
              const backoffMs = Math.min(500 * Math.pow(2, round), 5_000);
              await sleep(backoffMs);
            }
          }
          if (unresolved.length > 0) {
            console.log(
              `  [ws-signaled] WARNING: ${unresolved.length} pair(s) still split across workers after ${MAX_COLOCATION_ROUNDS} rounds`
            );
          }

          for (let i = 0; i + 1 < signaledPeers.length; i += 2) {
            const offerer = signaledPeers[i];
            const answerer = signaledPeers[i + 1];
            if (!offerer.userId || !answerer.userId) continue;
            answerer.negotiate(offerer.userId);
            await sleep(100);
            await offerer.negotiate(answerer.userId);
          }
        }

        const iperfPromise = this.startIperf(phase, iperfTarget);

        const startMs = Date.now();
        this.sampler.start();
        this.lagSampler.start();
        peers.forEach((p) => p.startSending(phase.msgPerSec, phase.totalMessages));
        await sleep(phase.durationSec * 1000);
        peers.forEach((p) => p.stopSending());
        const connectedPeers = peers.filter((p) => p.getMetrics().connectedAtPhaseEnd).length;
        this.sampler.stop();
        this.lagSampler.stop();
        const endMs = Date.now();

        const iperfLoad = await this.awaitIperf(iperfPromise);
        await Promise.allSettled(peers.map((p) => p.disconnect()));

        const modeLabel = isStarMode ? "ws-star" : "ws-signaled";
        const phaseName = `${modeLabel}-${phase.peerCount}p${
          phase.runIperf && iperfTarget ? `-iperf` : ""
        }`;
        const netStats = computeNetworkStats(this.sampler.getSamples(), endMs - startMs);
        const lagSamples = this.lagSampler.getSamples();
        const lagThresholdMs = this.config.lagThresholdMs ?? 50;
        const msgStats = this.collector.computeStats(
          phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, connectedPeers
        );
        const stats: PhaseStats = {
          ...msgStats,
          throughputMbps: netStats.throughputMbps,
          rssiDbm: netStats.rssiDbm,
          linkSpeedMbps: netStats.linkSpeedMbps,
          iperfBaseline,
          iperfLoad,
          lagP95Ms: computeLagP95(lagSamples),
          lagValid: isPhaseLagValid(lagSamples, lagThresholdMs),
        };
        printPhaseStats(stats);
        console.log(formatWebrtcBlock(stats));
        results.push(stats);
      }
    }

    console.log("\n=== SATURATION ANALYSIS ===");
    console.log(formatSaturationAnalysis(results));
    return results;
  }

  /**
   * Runs loopback control phases (tcp-signaled pair mode, 127.0.0.1) with the same
   * DTLS + media configuration as the main run. Used to produce a laptop establishment
   * ceiling for comparison via assessLaptopHeadroom.
   */
  async runLoopbackControl(phases: Phase[]): Promise<PhaseStats[]> {
    if (!this.config.webrtc) return [];
    const startPort = this.config.loopbackControl?.startPort ?? 9100;
    const results: PhaseStats[] = [];

    for (const phase of phases) {
      const peerCount = phase.peerCount % 2 === 0 ? phase.peerCount : phase.peerCount - 1;
      if (peerCount < 2) continue;

      this.collector.reset();
      this.lagSampler.reset();

      const peers = Array.from(
        { length: peerCount },
        (_, i) =>
          new TcpSignaledWrtcPeer(
            `loopback-ctrl-${i}`,
            i,
            startPort + i,
            this.collector,
            this.config.webrtc!,
            undefined,
          )
      );

      await Promise.allSettled(peers.map(p => p.connect()));
      console.log(`\n[loopback-control] phase: ${peerCount} peers, ${peerCount / 2} pairs`);

      const connectResults = await Promise.allSettled(
        peers
          .filter((_, i) => i % 2 === 0)
          .map((offerer, idx) => offerer.connectTo('127.0.0.1', peers[idx * 2 + 1].port))
      );
      const failedConnects = connectResults.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (failedConnects.length > 0) {
        console.error(`  [Error] ${failedConnects.length} loopback pairs failed:`);
        for (const f of failedConnects) console.error(`    - ${describeConnectError(f.reason)}`);
      }

      this.lagSampler.start();
      peers.forEach(p => p.startSending(phase.msgPerSec, phase.totalMessages));
      await sleep(phase.durationSec * 1000);
      peers.forEach(p => p.stopSending());
      const connectedPeers = peers.filter(p => p.getMetrics().connectedAtPhaseEnd).length;
      this.lagSampler.stop();

      await Promise.allSettled(peers.map(p => p.disconnect()));

      const lagSamples = this.lagSampler.getSamples();
      const lagThresholdMs = this.config.lagThresholdMs ?? 50;
      const msgStats = this.collector.computeStats(
        `loopback-ctrl-${peerCount}p`, peerCount, phase.msgPerSec, phase.durationSec, connectedPeers
      );
      const stats: PhaseStats = {
        ...msgStats,
        lagP95Ms: computeLagP95(lagSamples),
        lagValid: isPhaseLagValid(lagSamples, lagThresholdMs),
      };
      printPhaseStats(stats);
      results.push(stats);
    }

    return results;
  }

  private createTcpSignaledPeers(phase: Phase): TcpSignaledWrtcPeer[] {
    const lan = this.config.lan!;
    const phoneTarget =
      lan.phoneIp && lan.phonePort && lan.phoneUserId
        ? { ip: lan.phoneIp, port: lan.phonePort, userId: lan.phoneUserId, myIp: lan.hostIp }
        : undefined;
    return Array.from(
      { length: phase.peerCount },
      (_, i) =>
        new TcpSignaledWrtcPeer(
          `stress-tcp-sig-${i}`,
          i,
          phoneTarget ? 0 : lan.startPort + i,
          this.collector,
          this.config.webrtc!,
          phoneTarget,
        )
    );
  }

  private createWsSignaledPeers(phase: Phase): WsSignaledWrtcPeer[] {
    const ws = this.config.ws!;
    return Array.from(
      { length: phase.peerCount },
      (_, i) =>
        new WsSignaledWrtcPeer(
          `stress-ws-sig-${i}`,
          i,
          ws.serverUrl,
          this.collector,
          { username: `${ws.accountPrefix}${i}`, password: ws.password },
          this.config.webrtc!
        )
    );
  }

  private createWsStarPeers(phase: Phase): WsStarPeer[] {
    const ws = this.config.ws!;
    return Array.from(
      { length: phase.peerCount },
      (_, i) =>
        new WsStarPeer(
          `stress-ws-star-${i}`,
          i,
          ws.serverUrl,
          this.collector,
          { username: `${ws.accountPrefix}${i}`, password: ws.password },
          ws.phoneUserId!,
          this.config.webrtc!,
        )
    );
  }

  // Stage 1 — clean-link baseline. Runs once per transport, with no peers sending,
  // so it captures the link's healthy capacity to compare the under-load stage against.
  // First auto-calibrates the UDP offered load from a TCP capacity probe so the load is
  // derived from the live network instead of a hardcoded bandwidth.
  private async measureBaseline(
    targetIp: string | undefined
  ): Promise<IperfStats | null> {
    if (!targetIp) return null;

    console.log(
      `  [iperf:calibrate] probing link capacity (tcp) → ${targetIp} ...`
    );
    this.calibratedCapacityMbps = await Promise.race([
      runIperfTcp(targetIp, CAPACITY_PROBE_SEC),
      sleep(CAPACITY_PROBE_SEC * 1000 + IPERF_GRACE_MS).then(() => null),
    ]);
    const rate = this.udpRateMbps();
    console.log(
      this.calibratedCapacityMbps != null
        ? `  [iperf:calibrate] capacity ${
            this.calibratedCapacityMbps
          } Mbps → UDP load ${rate} Mbps (${Math.round(
            UDP_LOAD_FACTOR * 100
          )}%)`
        : `  [iperf:calibrate] capacity probe failed → UDP load uncapped (-b 0)`
    );

    console.log(
      `  [iperf:baseline] measuring clean link (no stress) → ${targetIp} ...`
    );
    const stats = await Promise.race([
      runIperfUdp(targetIp, BASELINE_IPERF_SEC, rate),
      sleep(BASELINE_IPERF_SEC * 1000 + IPERF_GRACE_MS).then(() => null),
    ]);
    logIperf(stats, "baseline");
    return stats;
  }

  // Stage 2 — under-load measurement. Started just before peers begin sending so it
  // runs concurrently with the stress traffic; awaited via awaitIperf() afterwards.
  // Reuses the capacity calibrated at baseline to offer the same UDP load.
  private startIperf(
    phase: Phase,
    targetIp: string | undefined
  ): Promise<IperfStats | null> | undefined {
    if (!phase.runIperf || !targetIp) return undefined;
    console.log(
      `  [iperf:under-load] measuring under stress → ${targetIp} ...`
    );
    return runIperfUdp(targetIp, phase.durationSec, this.udpRateMbps());
  }

  // UDP offered load = 90% of measured capacity (leaves headroom so loss/jitter reflect
  // real wire conditions, not local TX-queue overflow). 0 means uncapped (-b 0) fallback
  // when calibration failed; throughput is still read from the receiver, so it stays valid.
  private udpRateMbps(): number {
    if (this.calibratedCapacityMbps == null) return 0;
    return Math.max(
      1,
      Math.floor(this.calibratedCapacityMbps * UDP_LOAD_FACTOR)
    );
  }

  private async awaitIperf(
    iperfPromise: Promise<IperfStats | null> | undefined
  ): Promise<IperfStats | null> {
    const stats = iperfPromise
      ? await Promise.race([
          iperfPromise,
          sleep(IPERF_GRACE_MS).then(() => null),
        ])
      : null;
    logIperf(stats, "under-load");
    return stats;
  }
}

const BASELINE_IPERF_SEC = 10;
const IPERF_GRACE_MS = 10_000;
const CAPACITY_PROBE_SEC = 5;
const UDP_LOAD_FACTOR = 0.9;

function logIperf(stats: IperfStats | null, stage: string): void {
  if (!stats) return;
  console.log(
    `  [iperf:${stage}] ${stats.throughputMbps.toFixed(1)} Mbps | ` +
      `loss ${stats.lossPercent.toFixed(2)}% (${stats.lostPackets}/${
        stats.totalPackets
      }) | ` +
      `jitter ${stats.jitterMs.toFixed(2)}ms`
  );
}

function printPhaseStats(stats: PhaseStats): void {
  const rate = (stats.deliveryRate * 100).toFixed(1);
  console.log(
    `  Sent: ${stats.totalSent} | Acked: ${stats.totalAcked} (${rate}%) | TxOverflow: ${stats.txQueueOverflowCount}`
  );
  console.log(
    `  p50/p95/p99: ${stats.p50Ms}ms / ${stats.p95Ms}ms / ${stats.p99Ms}ms | RTT σ: ${stats.rttStddevMs}ms`
  );
  const lagVerdict = stats.lagValid ? 'ok' : 'INVALID';
  console.log(`  Laptop gate: EL-lag p95 ${stats.lagP95Ms}ms [${lagVerdict}]`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function batchedSettle<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize: number,
  delayMs: number,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) await sleep(delayMs);
  }
  return results;
}

function describeConnectError(reason: unknown): string {
  const err = reason as { message?: string; code?: string } | undefined;
  const message = err?.message ?? String(reason);
  if (err?.code === "EADDRINUSE") {
    return (
      `${message} — port already in use. A previous stress-test run may still be alive; ` +
      `kill it with "pkill -f 'ts-node src/runner.ts'" (or pick a different lan.startPort) and retry.`
    );
  }
  if (err?.code === "ECONNREFUSED") {
    return `${message} — nothing is listening at that address (server down or wrong host/port?).`;
  }
  return message;
}

function num(
  rec: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const v = rec?.[key];
  return typeof v === "number" ? v : undefined;
}

// Spawns iperf3, collects stdout, and resolves the parsed JSON `end` block (or null on
// failure). Shared by the TCP capacity probe and the UDP loss/jitter measurement.
function runIperf(args: string[]): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const proc = spawn("iperf3", args);
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.on("error", (err) => {
      console.error(`  [iperf] Failed to start: ${err.message}`);
      resolve(null);
    });
    proc.on("close", () => {
      try {
        const json = JSON.parse(stdout) as Record<string, unknown>;
        resolve((json["end"] as Record<string, unknown> | undefined) ?? null);
      } catch {
        resolve(null);
      }
    });
  });
}

// TCP capacity probe: TCP's congestion control self-discovers the link's achievable
// goodput, so the offered UDP load can be derived from the live network. Returns the
// delivered (receiver-side) rate in Mbps, or null on failure.
async function runIperfTcp(
  targetIp: string,
  durationSec: number
): Promise<number | null> {
  const end = await runIperf(["-c", targetIp, "-t", String(durationSec), "-J"]);
  const recv = end?.["sum_received"] as Record<string, unknown> | undefined;
  const bps = num(recv, "bits_per_second");
  return bps !== undefined ? Math.round((bps / 1_000_000) * 100) / 100 : null;
}

// UDP measurement at a bounded offered load (`rateMbps`, or uncapped when 0). Throughput
// is read from the receiver (`sum_received`) so it reflects what actually crossed the wire,
// not the sender's offered rate; loss/jitter come from the UDP `sum` block.
async function runIperfUdp(
  targetIp: string,
  durationSec: number,
  rateMbps: number
): Promise<IperfStats | null> {
  const bw = rateMbps > 0 ? `${rateMbps}M` : "0";
  const end = await runIperf([
    "-c",
    targetIp,
    "-u",
    "-b",
    bw,
    "-t",
    String(durationSec),
    "-J",
  ]);
  const sum = end?.["sum"] as Record<string, unknown> | undefined;
  if (!sum) return null;
  const recv = end?.["sum_received"] as Record<string, unknown> | undefined;
  const deliveredBps =
    num(recv, "bits_per_second") ?? num(sum, "bits_per_second") ?? 0;
  return {
    throughputMbps: Math.round((deliveredBps / 1_000_000) * 100) / 100,
    lossPercent: Math.round((num(sum, "lost_percent") ?? 0) * 100) / 100,
    jitterMs: Math.round((num(sum, "jitter_ms") ?? 0) * 100) / 100,
    lostPackets: num(sum, "lost_packets") ?? 0,
    totalPackets: num(sum, "packets") ?? 0,
  };
}
