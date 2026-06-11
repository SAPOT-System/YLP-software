import net from 'net';
import { LanPeer } from '@/peers/lan-peer';
import { MetricsCollector } from '@/metrics/collector';
import { generateKeyPair, computeSharedKey, decryptMessage, encryptMessage, parsePublicKey, buildHandshakeAck } from '@/protocol/tcp-protocol';
import { encodeBase64 } from 'tweetnacl-util';

async function simulateAppConnect(port: number): Promise<{ socket: net.Socket; sharedKey: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const appKp = generateKeyPair();
    let buf = '';
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      socket.write(JSON.stringify({ type: 'handshake-init', pub: encodeBase64(appKp.publicKey) }) + '\n');
    });
    socket.on('data', (raw) => {
      buf += raw.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const frame = JSON.parse(line);
        if (frame.type === 'handshake-ack') {
          resolve({ socket, sharedKey: computeSharedKey(appKp.secretKey, parsePublicKey(frame.pub)) });
        }
      }
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('handshake timeout')), 5000);
  });
}

async function startHandshakeServer(): Promise<{ server: net.Server; port: number; receivedFrames: unknown[] }> {
  const receivedFrames: unknown[] = [];
  const server = net.createServer((socket) => {
    let buf = '';
    let sharedKey: Uint8Array | undefined;

    socket.on('data', (raw) => {
      buf += raw.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line) as Record<string, unknown>;
          if (frame['type'] === 'handshake-init' && !sharedKey) {
            const kp = generateKeyPair();
            sharedKey = computeSharedKey(kp.secretKey, parsePublicKey(frame['pub'] as string));
            socket.write(JSON.stringify(buildHandshakeAck(kp.publicKey)) + '\n');
          } else if (frame['type'] === 'encrypted' && sharedKey) {
            receivedFrames.push(decryptMessage(sharedKey, frame as never));
          }
        } catch { /* ignore */ }
      }
    });
  });
  server.unref();
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  return { server, port: (server.address() as net.AddressInfo).port, receivedFrames };
}

describe('LanPeer', () => {
  let peer: LanPeer;
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
    peer = new LanPeer('test-peer-1', 0, '127.0.0.1', 0, collector);
  });

  afterEach(async () => { await peer.disconnect(); });

  it('starts a TCP server and completes ECDH handshake on inbound connection', async () => {
    await peer.connect();
    const { socket, sharedKey } = await simulateAppConnect(peer.port);
    expect(sharedKey).toHaveLength(32);
    socket.destroy();
  });

  it('connectTo completes outbound ECDH handshake', async () => {
    await peer.connect();
    const { server, port } = await startHandshakeServer();
    await peer.connectTo('127.0.0.1', port);
    expect(peer.getMetrics().connectionErrors).toBe(0);
    // Destroy client socket first so server.close() can complete immediately
    await peer.disconnect();
    await new Promise<void>(res => server.close(() => res()));
  });

  it('sends encrypted messages via connectTo and increments sent count', async () => {
    await peer.connect();
    const { server, port, receivedFrames } = await startHandshakeServer();

    await peer.connectTo('127.0.0.1', port);
    peer.startSending(10);
    await new Promise(res => setTimeout(res, 500));
    peer.stopSending();

    expect(peer.getMetrics().sent).toBeGreaterThan(0);
    expect(receivedFrames.length).toBeGreaterThan(0);
    // Destroy client socket first so server.close() can complete immediately
    await peer.disconnect();
    await new Promise<void>(res => server.close(() => res()));
  });

  it('connectTo rejects when target port is not listening', async () => {
    await peer.connect();
    await expect(peer.connectTo('127.0.0.1', 19999)).rejects.toThrow();
  });

  it('records RTT latency when echo server replies with stress-ack', async () => {
    const { server, port } = await new Promise<{ server: net.Server; port: number }>((resolve) => {
      const srv = net.createServer((socket) => {
        let buf = '';
        let sharedKey: Uint8Array | undefined;
        socket.on('data', (raw: Buffer) => {
          buf += raw.toString('utf8');
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const frame = JSON.parse(line) as Record<string, unknown>;
              if (frame['type'] === 'handshake-init' && !sharedKey) {
                const kp = generateKeyPair();
                sharedKey = computeSharedKey(kp.secretKey, parsePublicKey(frame['pub'] as string));
                socket.write(JSON.stringify(buildHandshakeAck(kp.publicKey)) + '\n');
              } else if (frame['type'] === 'encrypted' && sharedKey) {
                const msg = decryptMessage(sharedKey, frame as never);
                if (msg['type'] === 'stress-chat') {
                  socket.write(JSON.stringify(encryptMessage(sharedKey, { type: 'stress-ack', seq: msg['seq'], ts: msg['ts'] })) + '\n');
                }
              }
            } catch { /* ignore */ }
          }
        });
      });
      srv.unref();
      srv.listen(0, '127.0.0.1', () => resolve({ server: srv, port: (srv.address() as net.AddressInfo).port }));
    });

    await peer.connect();
    await peer.connectTo('127.0.0.1', port);
    peer.startSending(20);
    await new Promise(res => setTimeout(res, 400));
    peer.stopSending();
    await new Promise(res => setTimeout(res, 100));

    expect(peer.getMetrics().acked).toBeGreaterThan(0);
    expect(peer.getMetrics().writeLatencySamples.length).toBeGreaterThan(0);

    await peer.disconnect();
    await new Promise<void>(res => server.close(() => res()));
  });
});
