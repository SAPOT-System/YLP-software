import http from 'http';
import net from 'net';
import { WebSocketServer, WebSocket as WS } from 'ws';
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

describe('WsSignaledWrtcPeer', () => {
  let serverHandle: FakeServer;

  beforeEach(() => { serverHandle = startFakeSignalingServer(); });
  afterEach(async () => { await serverHandle.close(); });

  it('connect() resolves with a userId derived from the JWT', async () => {
    const col = new MetricsCollector();
    const peer = new WsSignaledWrtcPeer('peer-0', 0, serverHandle.url, col, { username: 'alice', password: 'pw' }, cfg);
    await peer.connect();
    expect(peer.userId).toBe('alice');
    await peer.disconnect();
  }, 10000);

  it('offerer and answerer negotiate over WS relay; iceEstablishMs is populated', async () => {
    const col = new MetricsCollector();
    const offerer = new WsSignaledWrtcPeer('peer-0', 0, serverHandle.url, col, { username: 'alice', password: 'pw' }, cfg);
    const answerer = new WsSignaledWrtcPeer('peer-1', 1, serverHandle.url, col, { username: 'bob', password: 'pw' }, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    answerer.negotiate(offerer.userId!);
    await new Promise((r) => setTimeout(r, 100));
    await offerer.negotiate(answerer.userId!);

    expect(offerer.getMetrics().iceEstablishMs.length).toBeGreaterThanOrEqual(1);
    expect(offerer.getMetrics().connectionErrors).toBe(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 25000);

  it('startSending increments sent count after successful negotiation', async () => {
    const col = new MetricsCollector();
    const offerer = new WsSignaledWrtcPeer('peer-0', 0, serverHandle.url, col, { username: 'alice', password: 'pw' }, cfg);
    const answerer = new WsSignaledWrtcPeer('peer-1', 1, serverHandle.url, col, { username: 'bob', password: 'pw' }, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    answerer.negotiate(offerer.userId!);
    await new Promise((r) => setTimeout(r, 100));
    await offerer.negotiate(answerer.userId!);

    offerer.startSending(10);
    answerer.startSending(10);
    await new Promise((r) => setTimeout(r, 500));
    offerer.stopSending();
    answerer.stopSending();

    expect(offerer.getMetrics().sent).toBeGreaterThan(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 25000);

  it('connect() rejects when server is unreachable, incrementing connectionErrors', async () => {
    const col = new MetricsCollector();
    const peer = new WsSignaledWrtcPeer('peer-0', 0, 'http://127.0.0.1:19997', col, { username: 'p0', password: 'pw' }, cfg);
    await expect(peer.connect()).rejects.toThrow();
    expect(peer.getMetrics().connectionErrors).toBe(1);
    await peer.disconnect();
  }, 10000);
});
