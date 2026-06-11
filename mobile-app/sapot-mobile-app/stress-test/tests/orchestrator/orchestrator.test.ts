import { WebSocketServer } from 'ws';
import { Orchestrator } from '@/orchestrator/orchestrator';
import { MetricsCollector } from '@/metrics/collector';
import { NetworkSampler } from '@/metrics/network-sampler';
import { TestConfig } from '@/orchestrator/test-config';

describe('Orchestrator (WS mode, fake server)', () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: 9903 });
    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (msg['type'] === 'chat') {
            const data = msg['data'] as Record<string, unknown>;
            ws.send(JSON.stringify({ type: 'server-ack', data: { messageId: data['messageId'], message_type: 'chat' } }));
          }
          if (msg['type'] === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch { /* ignore */ }
      });
    });
  });

  afterEach(async () => { await new Promise<void>(res => wss.close(() => res())); });

  it('runs a single phase and returns PhaseStats', async () => {
    const config: TestConfig = {
      mode: 'ws',
      ws: { serverUrl: 'ws://127.0.0.1:9903', accountPrefix: 'test_', password: '' },
      phases: [{ peerCount: 2, msgPerSec: 5, durationSec: 2 }],
      outputDir: '/tmp/stress-test-output',
    };
    const orchestrator = new Orchestrator(config, new MetricsCollector(), new NetworkSampler());
    const results = await orchestrator.run();
    expect(results).toHaveLength(1);
    expect(results[0].peerCount).toBe(2);
    expect(results[0].totalSent).toBeGreaterThan(0);
  }, 15000);
});
