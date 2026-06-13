import net from 'net';
import { TcpSignaledWrtcPeer } from '@/peers/tcp-signaled-wrtc-peer';
import { MetricsCollector } from '@/metrics/collector';
import { WebrtcConfig } from '@/orchestrator/test-config';

// Mock @homebridge/ciao so mDNS tests are hermetic and CI-safe
jest.mock('@homebridge/ciao', () => ({
  getResponder: jest.fn(),
  Protocol: { TCP: 'tcp' },
}));

const cfg: WebrtcConfig = { connectionTimeoutMs: 10000 };
const fastCfg: WebrtcConfig = { connectionTimeoutMs: 300 };
// Tiny timeout for star-mode tests — the phone dial will fail immediately
const starCfg: WebrtcConfig = { connectionTimeoutMs: 50 };

describe('TcpSignaledWrtcPeer', () => {
  it('connect() starts a TCP server and assigns a port', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, cfg);
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
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, 0, col, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    await offerer.connectTo('127.0.0.1', answerer.port);

    expect(offerer.getMetrics().iceEstablishMs.length).toBeGreaterThanOrEqual(1);
    expect(offerer.getMetrics().connectionErrors).toBe(0);
    expect(offerer.getMetrics().connectionTimeouts).toBe(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 20000);

  it('startSending increments sent count on the data channel after connectTo', async () => {
    const col = new MetricsCollector();
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, 0, col, cfg);

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
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, fastCfg);
    await peer.connect();
    await peer.connectTo('127.0.0.1', 19998);
    expect(peer.getMetrics().connectionErrors).toBe(1);
    await peer.disconnect();
  }, 5000);

  it('getMetrics returns a snapshot copy', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, fastCfg);
    await peer.connect();
    const m1 = peer.getMetrics();
    const m2 = peer.getMetrics();
    expect(m1).not.toBe(m2);
    await peer.disconnect();
  }, 5000);
});

describe('TcpSignaledWrtcPeer — mDNS advertisement (star mode)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ciaoMock = require('@homebridge/ciao') as { getResponder: jest.Mock; Protocol: { TCP: string } };

  let endFn: jest.Mock;
  let advertiseFn: jest.Mock;
  let createServiceFn: jest.Mock;

  const phoneTarget = {
    ip: '127.0.0.1',   // loopback so the dial-out fails fast
    port: 19997,
    userId: 'phone-user-id',
    myIp: '192.168.1.50',
  };

  beforeEach(() => {
    endFn = jest.fn().mockResolvedValue(undefined);
    advertiseFn = jest.fn().mockResolvedValue(undefined);
    createServiceFn = jest.fn().mockReturnValue({ advertise: advertiseFn, end: endFn });
    ciaoMock.getResponder.mockReturnValue({ createService: createServiceFn });
  });

  afterEach(() => jest.clearAllMocks());

  it('calls mDNS advertise() after connect() in star mode', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('stress-peer-0', 0, 0, col, starCfg, phoneTarget);
    await peer.connect();
    // advertiseMdns is fire-and-forget; give the microtask queue a tick to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(ciaoMock.getResponder).toHaveBeenCalledWith({ interface: phoneTarget.myIp });
    expect(advertiseFn).toHaveBeenCalled();
    await peer.disconnect();
  }, 3000);

  it('createService receives the correct identity TXT records', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('stress-peer-0', 0, 0, col, starCfg, phoneTarget);
    await peer.connect();
    await new Promise((r) => setTimeout(r, 50));
    expect(createServiceFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'stress-peer-0',
        txt: expect.objectContaining({
          id: 'stress-peer-0',
          peerId: 'stress-peer-0',
        }),
      }),
    );
    await peer.disconnect();
  }, 3000);

  it('calls mDNS end() on disconnect() in star mode', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('stress-peer-0', 0, 0, col, starCfg, phoneTarget);
    await peer.connect();
    await new Promise((r) => setTimeout(r, 50));
    await peer.disconnect();
    expect(endFn).toHaveBeenCalled();
  }, 3000);

  it('mDNS failure in star mode is non-fatal — connect and disconnect still succeed', async () => {
    ciaoMock.getResponder.mockImplementationOnce(() => { throw new Error('ciao unavailable'); });
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('stress-peer-0', 0, 0, col, starCfg, phoneTarget);
    await expect(peer.connect()).resolves.toBeUndefined();
    await expect(peer.disconnect()).resolves.toBeUndefined();
  }, 3000);

  it('does not call mDNS advertise in pair mode (no phoneTarget)', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, starCfg);
    await peer.connect();
    await new Promise((r) => setTimeout(r, 50));
    expect(ciaoMock.getResponder).not.toHaveBeenCalled();
    await peer.disconnect();
  }, 3000);
});

describe('TcpSignaledWrtcPeer — discovery probe detection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ciaoMock = require('@homebridge/ciao') as { getResponder: jest.Mock; Protocol: { TCP: string } };

  beforeEach(() => {
    const endFn = jest.fn().mockResolvedValue(undefined);
    const advertiseFn = jest.fn().mockResolvedValue(undefined);
    const createServiceFn = jest.fn().mockReturnValue({ advertise: advertiseFn, end: endFn });
    ciaoMock.getResponder.mockReturnValue({ createService: createServiceFn });
  });

  afterEach(() => jest.clearAllMocks());

  const phoneTarget = {
    ip: '127.0.0.1',
    port: 19996,
    userId: 'phone-user-id',
    myIp: '192.168.1.50',
  };

  it('bare connect-then-close in star mode is recorded as a discovery probe', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('probe-peer', 0, 0, col, starCfg, phoneTarget);
    await peer.connect();
    await new Promise((r) => setTimeout(r, 50)); // let advertiseMdns set advertiseMs

    // Bare-connect: open a TCP connection and immediately close it (no data)
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host: '127.0.0.1', port: peer.port }, () => {
        s.destroy();
        resolve();
      });
      s.on('error', reject);
    });
    await new Promise((r) => setTimeout(r, 100)); // let probe detection settle

    const stats = col.computeStats('test', 1, 1, 1, 0, 1000);
    expect(stats.discoveryCompleteness).toBe(1.0);
    expect(stats.discoveryP50Ms).toBeGreaterThanOrEqual(0);

    await peer.disconnect();
  }, 5000);

  it('connection that completes NaCl handshake is not recorded as a discovery probe', async () => {
    const col = new MetricsCollector();
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, 0, col, cfg);
    await Promise.all([offerer.connect(), answerer.connect()]);
    await offerer.connectTo('127.0.0.1', answerer.port);

    const stats = col.computeStats('test', 2, 1, 1, 0, 1000);
    expect(stats.discoveryCompleteness).toBe(0); // no probes — full handshakes only

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 20000);

  it('only the first probe per peer is counted toward discovery latency', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('probe-peer', 0, 0, col, starCfg, phoneTarget);
    await peer.connect();
    await new Promise((r) => setTimeout(r, 50));

    // Send two bare probes
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve, reject) => {
        const s = net.createConnection({ host: '127.0.0.1', port: peer.port }, () => {
          s.destroy();
          resolve();
        });
        s.on('error', reject);
      });
      await new Promise((r) => setTimeout(r, 60));
    }

    const stats = col.computeStats('test', 1, 1, 1, 0, 2000);
    expect(stats.discoveryCompleteness).toBe(1.0); // still 1/1
    // Only one latency sample → p50 == p95
    expect(stats.discoveryP50Ms).toBe(stats.discoveryP95Ms);

    await peer.disconnect();
  }, 5000);

  it('pair mode (no phoneTarget) never records discovery probes', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('pair-peer', 0, 0, col, cfg);
    await peer.connect();

    // Bare probe to the pair-mode peer
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host: '127.0.0.1', port: peer.port }, () => {
        s.destroy();
        resolve();
      });
      s.on('error', reject);
    });
    await new Promise((r) => setTimeout(r, 100));

    const stats = col.computeStats('test', 1, 1, 1, 0, 1000);
    expect(stats.discoveryCompleteness).toBe(0); // pair mode never records probes

    await peer.disconnect();
  }, 5000);
});
