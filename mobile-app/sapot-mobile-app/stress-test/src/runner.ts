import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { TestConfig, validateConfig } from './orchestrator/test-config';
import { Orchestrator } from './orchestrator/orchestrator';
import { MetricsCollector } from './metrics/collector';
import { NetworkSampler } from './metrics/network-sampler';
import { formatTable, computeNetworkStats, writeResults } from './metrics/reporter';

const program = new Command();

program
  .name('stress-test')
  .description('Sapot LAN + WebSocket stress tester')
  .option('-c, --config <path>', 'path to config JSON', './stress-test.config.json')
  .option('--mode <mode>', 'override mode: lan | ws | both')
  .option('--host-ip <ip>', 'override LAN host IP')
  .option('--server-url <url>', 'override WS server URL')
  .option('--output-dir <dir>', 'override output directory', './stress-results')
  .action(async (opts: {
    config: string;
    mode?: string;
    hostIp?: string;
    serverUrl?: string;
    outputDir: string;
  }) => {
    const configPath = path.resolve(opts.config);
    if (!fs.existsSync(configPath)) {
      console.error(`Config not found: ${configPath}`);
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TestConfig;
    if (opts.mode) config.mode = opts.mode as TestConfig['mode'];
    if (opts.hostIp && config.lan) config.lan.hostIp = opts.hostIp;
    if (opts.serverUrl && config.ws) config.ws.serverUrl = opts.serverUrl;
    config.outputDir = opts.outputDir;

    try { validateConfig(config); } catch (e) {
      console.error(`Config error: ${(e as Error).message}`);
      process.exit(1);
    }

    const collector = new MetricsCollector();
    const sampler = new NetworkSampler();
    const orchestrator = new Orchestrator(config, collector, sampler);

    process.on('SIGINT', () => {
      console.log('\nInterrupted — flushing partial results...');
      sampler.stop();
    });

    console.log(`Starting stress test — mode: ${config.mode} | phases: ${config.phases.length}`);
    const results = await orchestrator.run();
    const totalDurationMs = config.phases.reduce((s, p) => s + p.durationSec * 1000, 0);
    const networkStats = computeNetworkStats(sampler.getSamples(), totalDurationMs);

    console.log('\n\n=== RESULTS ===');
    console.log(formatTable(results));
    if (networkStats.throughputMbps > 0) {
      console.log(`\nNetwork: ${networkStats.throughputMbps} Mbps throughput`);
      console.log(`WiFi: ${networkStats.rssiDbm} dBm @ ${networkStats.linkSpeedMbps} Mbps | Loss: ${networkStats.packetLossPercent}%`);
    }
    writeResults(config.outputDir, config.mode, results, networkStats);
  });

program.parse(process.argv);
