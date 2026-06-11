import { WebSocketServer } from 'ws';
import { WsPeer } from '@/peers/ws-peer';
import { MetricsCollector } from '@/metrics/collector';

function startFakeWsServer(port: number, sendAck = true): WebSocketServer {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg['type'] === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        if (msg['type'] === 'chat' && sendAck) {
          const data = msg['data'] as Record<string, unknown>;
          ws.send(JSON.stringify({ type: 'server-ack', data: { messageId: data['messageId'], message_type: 'chat' } }));
        }
      } catch { /* ignore */ }
    });
  });
  return wss;
}

describe('WsPeer', () => {
  let wss: WebSocketServer;
  let peer: WsPeer;
  let collector: MetricsCollector;

  beforeEach(async () => {
    wss = startFakeWsServer(9901);
    collector = new MetricsCollector();
    peer = new WsPeer('ws-peer-1', 0, 'ws://127.0.0.1:9901', collector);
  });

  afterEach(async () => {
    await peer.disconnect();
    await new Promise<void>(res => wss.close(() => res()));
  });

  it('connects to WebSocket server', async () => {
    await peer.connect();
    expect(peer.isConnected).toBe(true);
  });

  it('sends messages and records ack latency', async () => {
    await peer.connect();
    peer.startSending(5);
    await new Promise(res => setTimeout(res, 800));
    peer.stopSending();
    const metrics = peer.getMetrics();
    expect(metrics.sent).toBeGreaterThan(0);
    expect(metrics.acked).toBeGreaterThan(0);
  });

  it('records dropped when ack never arrives', async () => {
    const noAckWss = startFakeWsServer(9902, false);
    const noAckPeer = new WsPeer('ws-peer-2', 1, 'ws://127.0.0.1:9902', new MetricsCollector(), 200);
    await noAckPeer.connect();
    noAckPeer.startSending(10);
    await new Promise(res => setTimeout(res, 500));
    noAckPeer.stopSending();
    await new Promise(res => setTimeout(res, 300));
    await noAckPeer.disconnect();
    await new Promise<void>(res => noAckWss.close(() => res()));
    expect(noAckPeer.getMetrics().dropped).toBeGreaterThan(0);
  });
});
