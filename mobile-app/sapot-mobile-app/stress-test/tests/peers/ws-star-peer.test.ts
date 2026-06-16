import http from 'http';
import net from 'net';
import { WebSocketServer, WebSocket as WS } from 'ws';
import { WsStarPeer } from '@/peers/ws-star-peer';
import { WsSignaledWrtcPeer } from '@/peers/ws-signaled-wrtc-peer';
import { MetricsCollector } from '@/metrics/collector';
import { WebrtcConfig } from '@/orchestrator/test-config';

interface FakeServer {
  close: () => Promise<void>;
  url: string;
}

function startFakeSignalingServer(): FakeServer {
  const wsConnections = new Map<string, WS>();
  const httpSockets = new Set<net.Socket>();

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/auth/token') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const username = params.get('username') ?? 'unknown';
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
        const payload = Buffer.from(JSON.stringify({ sub: username })).toString('base64');
        const token = `${header}.${payload}.sig`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: token }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });

  httpServer.on('connection', (socket) => {
    httpSockets.add(socket);
    socket.on('close', () => httpSockets.delete(socket));
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', 'ws://localhost');
    const token = url.searchParams.get('token') ?? '';
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      ) as Record<string, unknown>;
      const userId = payload['sub'] as string;
      wsConnections.set(userId, ws);
      ws.on('close', () => wsConnections.delete(userId));
    } catch { /* ignore bad tokens */ }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg['type'] === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
        const data = msg['data'] as Record<string, unknown> | undefined;
        if (typeof data?.['to'] === 'string') {
          const target = wsConnections.get(data['to'] as string);
          if (target?.readyState === WS.OPEN) target.send(raw.toString());
        }
      } catch { /* ignore */ }
    });
  });

  httpServer.listen(0);
  const port = (httpServer.address() as net.AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((res) => {
      wss.close(() => {
        httpSockets.forEach((s) => s.destroy());
        httpServer.close(() => res());
      });
    }),
  };
}

const cfg: WebrtcConfig = { connectionTimeoutMs: 12000 };

function makeOpeningMockDc(sentMessages: string[]) {
  let capturedOnOpen: (() => void) | null = null;
  let capturedOnMessage: ((msg: string) => void) | null = null;
  return {
    onOpen: jest.fn((cb: () => void) => { capturedOnOpen = cb; }),
    onMessage: jest.fn((cb: (msg: string) => void) => { capturedOnMessage = cb; }),
    isOpen: jest.fn(() => true),
    sendMessage: jest.fn((msg: string) => { sentMessages.push(msg); return true; }),
    fire: (msg: string) => capturedOnMessage!(msg),
    open: () => capturedOnOpen?.(),
  };
}

describe('WsStarPeer — data channel format', () => {
  const fastCfg: WebrtcConfig = { connectionTimeoutMs: 100 };

  it('startSending sends JSON stress-echo format', async () => {
    const col = new MetricsCollector();
    const peer = new WsStarPeer('star-0', 0, 'http://127.0.0.1:19988', col, { username: 'star0', password: 'pw' }, 'phone', fastCfg);

    const sent: string[] = [];
    const mockDc = makeOpeningMockDc(sent);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = peer as any;
    p.connectStartMs = Date.now();
    p.setupDataChannel(mockDc);
    mockDc.open();

    peer.startSending(100, 1);
    await new Promise((r) => setTimeout(r, 50));
    peer.stopSending();

    expect(sent.length).toBeGreaterThan(0);
    const frame = JSON.parse(sent[0]) as Record<string, unknown>;
    expect(frame['type']).toBe('stress-echo');
    expect(typeof frame['seq']).toBe('number');
    expect(typeof frame['sentAt']).toBe('number');

    await peer.disconnect();
  }, 5000);

  it('setupDataChannel increments acked on stress-ack frame', async () => {
    const col = new MetricsCollector();
    const peer = new WsStarPeer('star-0', 0, 'http://127.0.0.1:19988', col, { username: 'star0', password: 'pw' }, 'phone', fastCfg);

    const mockDc = makeOpeningMockDc([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = peer as any;
    p.connectStartMs = Date.now();
    p.setupDataChannel(mockDc);

    const sentAt = Date.now() - 50;
    mockDc.fire(JSON.stringify({ type: 'stress-ack', seq: 0, sentAt }));

    expect(peer.getMetrics().acked).toBe(1);
    expect(peer.getMetrics().writeLatencySamples.length).toBe(1);

    await peer.disconnect();
  }, 5000);

  it('setupDataChannel ignores non-JSON frames', async () => {
    const col = new MetricsCollector();
    const peer = new WsStarPeer('star-0', 0, 'http://127.0.0.1:19988', col, { username: 'star0', password: 'pw' }, 'phone', fastCfg);

    const mockDc = makeOpeningMockDc([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = peer as any;
    p.connectStartMs = Date.now();
    p.setupDataChannel(mockDc);

    mockDc.fire('ACK:0:12345');
    mockDc.fire('not-json');

    expect(peer.getMetrics().acked).toBe(0);

    await peer.disconnect();
  }, 5000);

  it('setupDataChannel ignores JSON with unknown type', async () => {
    const col = new MetricsCollector();
    const peer = new WsStarPeer('star-0', 0, 'http://127.0.0.1:19988', col, { username: 'star0', password: 'pw' }, 'phone', fastCfg);

    const mockDc = makeOpeningMockDc([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = peer as any;
    p.connectStartMs = Date.now();
    p.setupDataChannel(mockDc);

    mockDc.fire(JSON.stringify({ type: 'pong' }));
    mockDc.fire(JSON.stringify({ type: 'other', data: {} }));

    expect(peer.getMetrics().acked).toBe(0);

    await peer.disconnect();
  }, 5000);
});

describe('WsStarPeer', () => {
  let serverHandle: FakeServer;

  beforeEach(() => { serverHandle = startFakeSignalingServer(); });
  afterEach(async () => { await serverHandle.close(); });

  it('connectedAtPhaseEnd defaults to false before any negotiation', async () => {
    const col = new MetricsCollector();
    const peer = new WsStarPeer('star-0', 0, serverHandle.url, col, { username: 'star0', password: 'pw' }, 'nonexistent-phone', cfg);
    await peer.connect();
    expect(peer.getMetrics().connectedAtPhaseEnd).toBe(false);
    await peer.disconnect();
  }, 10000);

  it('connectedAtPhaseEnd is true after real ICE loopback via a WsSignaledWrtcPeer phone proxy', async () => {
    const col = new MetricsCollector();
    // A WsSignaledWrtcPeer (peerIndex 1 = answerer) acts as the "phone".
    const phone = new WsSignaledWrtcPeer('phone', 1, serverHandle.url, col, { username: 'phone', password: 'pw' }, cfg);
    await phone.connect();

    const star = new WsStarPeer('star-0', 0, serverHandle.url, col, { username: 'star0', password: 'pw' }, phone.userId!, cfg);
    await star.connect();

    // Phone sets the star peer as its partner so it processes the incoming offer.
    phone.negotiate(star.userId!);
    await new Promise((r) => setTimeout(r, 100));
    await star.negotiate();

    expect(star.getMetrics().connectedAtPhaseEnd).toBe(true);

    await Promise.all([star.disconnect(), phone.disconnect()]);
  }, 25000);

  it('connectedAtPhaseEnd stays false when connection times out (no phone answering)', async () => {
    const fastCfg: WebrtcConfig = { connectionTimeoutMs: 200 };
    const col = new MetricsCollector();
    const peer = new WsStarPeer('star-0', 0, serverHandle.url, col, { username: 'star0', password: 'pw' }, 'no-such-phone', fastCfg);
    await peer.connect();
    await peer.negotiate();
    expect(peer.getMetrics().connectedAtPhaseEnd).toBe(false);
    await peer.disconnect();
  }, 10000);
});
