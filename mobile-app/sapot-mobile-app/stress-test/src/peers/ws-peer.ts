import WebSocket from 'ws';
import { buildChatMessage, isServerAck, isPong, fetchJwt, buildWsUrl, decodeToken } from '../protocol/ws-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';

export class WsPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  private ws?: WebSocket;
  private metrics: PeerMetrics = emptyMetrics();
  private sendTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private pendingAcks = new Map<string, { sentAt: number; timer: NodeJS.Timeout }>();
  private myUserId?: string;
  private targetUserId: string = 'device-under-test';

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly serverUrl: string,
    private readonly collector: MetricsCollector,
    private readonly ackTimeoutMs = 5000,
    private readonly credentials?: { username: string; password: string },
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  setTarget(targetId: string): void {
    this.targetUserId = targetId;
  }

  get userId(): string | undefined {
    return this.myUserId;
  }

  async connect(): Promise<void> {
    let url = this.serverUrl;
    if (!url.startsWith('ws') && this.credentials) {
      const token = await fetchJwt(this.serverUrl, this.credentials.username, this.credentials.password);
      this.myUserId = decodeToken(token).userId;
      // console.log(`[${this.peerId}] Authenticated as UUID: ${this.myUserId}`);
      url = buildWsUrl(this.serverUrl, token);
    }
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      const timeout = setTimeout(() => reject(new Error(`WS connect timeout: ${this.peerId}`)), 10000);
      this.ws.on('open', () => {
        // console.log(`[${this.peerId}] Connected`);
        clearTimeout(timeout);
        this.startHeartbeat();
        resolve();
      });
      this.ws.on('message', (raw) => {
        // console.log(`[${this.peerId}] Received: ${raw}`);
        this.handleMessage(raw.toString());
      });
      this.ws.on('error', (err) => {
        console.error(`[${this.peerId}] Error:`, err.message);
        clearTimeout(timeout);
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
        reject(err);
      });
      this.ws.on('close', (code, reason) => {
        // console.log(`[${this.peerId}] Closed: ${code} ${reason}`);
        this.ws = undefined;
      });
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as unknown;
      if (isPong(msg)) return;
      if (isServerAck(msg)) {
        const pending = this.pendingAcks.get(msg.data.messageId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingAcks.delete(msg.data.messageId);
          const latency = Date.now() - pending.sentAt;
          this.metrics.acked++;
          // console.log(`[${this.peerId}] Acked: ${msg.data.messageId} (${latency}ms)`);
          this.metrics.writeLatencySamples.push(latency);
          this.collector.recordAcked(this.peerId, pending.sentAt, latency);
        }
      }
    } catch { /* ignore */ }
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1000 / msgPerSec));
    // console.log(`[${this.peerId}] Starting send loop: ${msgPerSec} msg/sec (${intervalMs}ms)`);
    this.sendTimer = setInterval(() => {
      if (!this.isConnected) {
        // console.warn(`[${this.peerId}] Skipping send - not connected`);
        return;
      }
      const fromId = this.myUserId || this.peerId;
      const msg = buildChatMessage(fromId, this.targetUserId, `stress-${this.metrics.sent}`);
      const sentAt = Date.now();
      this.pendingAcks.set(msg.data.messageId, {
        sentAt,
        timer: setTimeout(() => {
          if (!this.pendingAcks.has(msg.data.messageId)) return;
          this.pendingAcks.delete(msg.data.messageId);
          this.metrics.dropped++;
          this.collector.recordDropped(this.peerId);
        }, this.ackTimeoutMs),
      });
      this.ws!.send(JSON.stringify(msg));
      // console.log(`[${this.peerId}] Sent message ${msg.data.messageId}`);
      this.metrics.sent++;
      this.collector.recordSent(this.peerId, sentAt);
    }, intervalMs);
  }

  stopSending(): void {
    clearInterval(this.sendTimer);
    this.sendTimer = undefined;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) this.ws!.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    clearInterval(this.heartbeatTimer);
    for (const { timer } of this.pendingAcks.values()) clearTimeout(timer);
    this.pendingAcks.clear();
    if (this.ws) {
      this.ws.close(1000, 'stress_test_done');
      await new Promise<void>(res => {
        this.ws?.once('close', () => res());
        setTimeout(res, 2000);
      });
    }
  }

  getMetrics(): PeerMetrics { return { ...this.metrics }; }
}
