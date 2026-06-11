import net from 'net';
import { LanPeer } from '@/peers/lan-peer';
import { MetricsCollector } from '@/metrics/collector';
import { generateKeyPair, computeSharedKey, decryptMessage, parsePublicKey } from '@/protocol/tcp-protocol';
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

describe('LanPeer', () => {
  let peer: LanPeer;
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
    peer = new LanPeer('test-peer-1', 0, '127.0.0.1', 0, collector);
  });

  afterEach(async () => { await peer.disconnect(); });

  it('starts a TCP server and completes ECDH handshake', async () => {
    await peer.connect();
    const { socket, sharedKey } = await simulateAppConnect(peer.port);
    expect(sharedKey).toHaveLength(32);
    socket.destroy();
  });

  it('sends encrypted messages and increments sent count', async () => {
    await peer.connect();
    const received: unknown[] = [];
    const { socket, sharedKey } = await simulateAppConnect(peer.port);
    let buf = '';
    socket.on('data', (raw) => {
      buf += raw.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const frame = JSON.parse(line);
        if (frame.type === 'encrypted') received.push(decryptMessage(sharedKey, frame));
      }
    });
    peer.startSending(10);
    await new Promise(res => setTimeout(res, 500));
    peer.stopSending();
    expect(received.length).toBeGreaterThan(0);
    expect(peer.getMetrics().sent).toBeGreaterThan(0);
    socket.destroy();
  });
});
