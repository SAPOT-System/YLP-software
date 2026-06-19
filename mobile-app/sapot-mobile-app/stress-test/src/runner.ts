import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { TestConfig, validateConfig } from './orchestrator/test-config';
import { Orchestrator } from './orchestrator/orchestrator';
import { MetricsCollector } from './metrics/collector';
import { NetworkSampler } from './metrics/network-sampler';
import { EventLoopLagSampler } from './metrics/event-loop-lag-sampler';
import { formatTable, formatCeilingSummary, formatHeadroomSummary, formatLinkHealthSummary, writeResults } from './metrics/reporter';
import { determineCeiling } from './metrics/ceiling-rule';
import { assessLaptopHeadroom } from './metrics/laptop-headroom';
import { isLinkHealthy } from './metrics/link-health';

const program = new Command();

program
  .name('stress-test')
  .description('Sapot WebRTC stress tester (tcp-signaled and ws-signaled modes)')
  .option('-c, --config <path>', 'path to config JSON', './stress-test.config.json')
  .option('--mode <mode>', 'override mode: tcp-signaled | ws-signaled')
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
    const lagSampler = new EventLoopLagSampler();
    const orchestrator = new Orchestrator(config, collector, sampler, lagSampler);

    process.on('SIGINT', () => {
      console.log('\nInterrupted — flushing partial results...');
      sampler.stop();
    });

    console.log(`Starting stress test — mode: ${config.mode} | phases: ${config.phases.length}`);
    try {
      let loopbackResults: import('./metrics/collector').PhaseStats[] = [];
      if (config.loopbackControl) {
        console.log(`\n=== LOOPBACK CONTROL RUN (${config.loopbackControl.phases.length} phase(s)) ===`);
        loopbackResults = await orchestrator.runLoopbackControl(config.loopbackControl.phases);
      }

      const results = await orchestrator.run();
      const ceiling = determineCeiling(results);
      const linkHealth = isLinkHealthy(results[0]?.iperfBaseline ?? null, results[0]?.iperfLoad ?? null);

      console.log('\n\n=== RESULTS ===');
      console.log(formatLinkHealthSummary(linkHealth));
      console.log(formatTable(results));
      console.log('\n' + formatCeilingSummary(results, ceiling));

      if (config.loopbackControl) {
        const loopbackCeiling = determineCeiling(loopbackResults);
        const headroom = assessLaptopHeadroom(loopbackCeiling, ceiling);
        console.log('\n' + formatHeadroomSummary(headroom));
      }

      writeResults(config.outputDir, config.mode, results);
    } catch (e) {
      console.error(`Stress test failed: ${(e as Error).message}`);
      process.exit(1);
    }

    // Force exit: the mDNS responder (@homebridge/ciao) and other native
    // handles keep the event loop alive, so the process would otherwise hang
    // after finishing — leaking bound ports and blocking the next run.
    process.exit(0);
  });

program.parse(process.argv);
