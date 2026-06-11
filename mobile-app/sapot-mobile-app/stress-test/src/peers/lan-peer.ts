import net from 'net';
import { Protocol } from '@homebridge/ciao';
import {
  generateKeyPair, computeSharedKey, encryptMessage, decryptMessage,
  buildHandshakeAck, parsePublicKey, EncryptedEnvelope,
} from '../protocol/tcp-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';

export class LanPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  private _port: number;
  private server: net.Server;
  private socket?: net.Socket;
  private sharedKey?: Uint8Array;
  private receiveBuffer = '';
  private handshakeDone = false;
  private metrics: PeerMetrics = emptyMetrics();
  private sendTimer?: NodeJS.Timeout;

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly hostIp: string,
    port: number,
    private readonly collector: MetricsCollector,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
    this._port = port;
    this.server = net.createServer();
  }

  get port(): number { return this._port; }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.listen(this._port, '0.0.0.0', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        resolve();
      });
      this.server.on('error', reject);
    });

    this.server.on('connection', (socket) => {
      this.socket = socket;
      const kp = generateKeyPair();
      this.receiveBuffer = '';
      this.handshakeDone = false;

      socket.on('data', (raw) => {
        this.receiveBuffer += raw.toString('utf8');
        const lines = this.receiveBuffer.split('\n');
        this.receiveBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line) as Record<string, unknown>;
            if (!this.handshakeDone) {
              if (frame['type'] !== 'handshake-init') return;
              this.sharedKey = computeSharedKey(kp.secretKey, parsePublicKey(frame['pub'] as string));
              socket.write(JSON.stringify(buildHandshakeAck(kp.publicKey)) + '\n');
              this.handshakeDone = true;
            } else if (frame['type'] === 'encrypted' && this.sharedKey) {
              decryptMessage(this.sharedKey, frame as unknown as EncryptedEnvelope);
            }
          } catch { /* malformed frame */ }
        }
      });

      socket.on('error', () => {
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
      });
      socket.on('close', () => {
        this.socket = undefined;
        this.handshakeDone = false;
        this.sharedKey = undefined;
      });
    });

    await this.advertiseMdns();
  }

  private async advertiseMdns(): Promise<void> {
    try {
      const { getResponder } = await import('@homebridge/ciao');
      const responder = getResponder();
      const svc = responder.createService({
        name: this.peerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: 'lanchat' as any,
        protocol: Protocol.TCP,
        port: this._port,
        txt: { peerId: this.peerId },
      });
      await svc.advertise();
    } catch { /* mDNS optional in test environment */ }
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.socket || !this.sharedKey || !this.handshakeDone) return;
      const sentAt = Date.now();
      try {
        const envelope = encryptMessage(this.sharedKey, {
          type: 'stress-chat',
          from: this.peerId,
          ts: sentAt,
          seq: this.metrics.sent,
        });
        const writeStart = Date.now();
        const flushed = this.socket.write(JSON.stringify(envelope) + '\n');
        const recordLatency = (latency: number) => {
          this.metrics.writeLatencySamples.push(latency);
          this.metrics.acked++;
          this.collector.recordAcked(this.peerId, sentAt, latency);
        };
        if (flushed) {
          recordLatency(Date.now() - writeStart);
        } else {
          this.socket.once('drain', () => recordLatency(Date.now() - writeStart));
        }
        this.metrics.sent++;
        this.collector.recordSent(this.peerId, sentAt);
      } catch {
        this.metrics.dropped++;
        this.collector.recordDropped(this.peerId);
      }
    }, intervalMs);
  }

  stopSending(): void {
    clearInterval(this.sendTimer);
    this.sendTimer = undefined;
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    this.socket?.destroy();
    await new Promise<void>(res => this.server.close(() => res()));
  }

  getMetrics(): PeerMetrics { return { ...this.metrics }; }
}
