import net from 'net';
import { TcpSignaledWrtcPeer } from '@/peers/tcp-signaled-wrtc-peer';
import { MetricsCollector } from '@/metrics/collector';
import { WebrtcConfig } from '@/orchestrator/test-config';

const cfg: WebrtcConfig = { connectionTimeoutMs: 10000 };
const fastCfg: WebrtcConfig = { connectionTimeoutMs: 300 };

describe('TcpSignaledWrtcPeer', () => {
  it('connect() starts a TCP server and assigns a port', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, cfg);
    await peer.connect();
    expect(peer.port).toBeGreaterThan(0);
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection({ host: '127.0.0.1', port: peer.port }, () => resolve(s));
      s.on('error', reject);
    });
    socket.destroy();
    await peer.disconnect();
  }, 5000);

  it('offerer and answerer negotiate via TCP signaling; iceEstablishMs is populated', async () => {
    const col = new MetricsCollector();
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, '127.0.0.1', 0, col, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    await offerer.connectTo('127.0.0.1', answerer.port);

    expect(offerer.getMetrics().iceEstablishMs.length).toBeGreaterThanOrEqual(1);
    expect(offerer.getMetrics().connectionErrors).toBe(0);
    expect(offerer.getMetrics().connectionTimeouts).toBe(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 20000);

  it('startSending increments sent count on the data channel after connectTo', async () => {
    const col = new MetricsCollector();
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, '127.0.0.1', 0, col, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    await offerer.connectTo('127.0.0.1', answerer.port);

    offerer.startSending(10);
    answerer.startSending(10);
    await new Promise((r) => setTimeout(r, 500));
    offerer.stopSending();
    answerer.stopSending();

    expect(offerer.getMetrics().sent).toBeGreaterThan(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 20000);

  it('records connectionError when the target port is not listening', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, fastCfg);
    await peer.connect();
    await peer.connectTo('127.0.0.1', 19998);
    expect(peer.getMetrics().connectionErrors).toBe(1);
    await peer.disconnect();
  }, 5000);

  it('getMetrics returns a snapshot copy', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, fastCfg);
    await peer.connect();
    const m1 = peer.getMetrics();
    const m2 = peer.getMetrics();
    expect(m1).not.toBe(m2);
    await peer.disconnect();
  }, 5000);
});
