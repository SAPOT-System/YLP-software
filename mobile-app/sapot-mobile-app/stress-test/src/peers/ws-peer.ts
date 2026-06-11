import WebSocket from 'ws';
import { buildChatMessage, isServerAck, isPong } from '../protocol/ws-protocol';
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

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly wsUrl: string,
    private readonly collector: MetricsCollector,
    private readonly ackTimeoutMs = 5000,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      const timeout = setTimeout(() => reject(new Error(`WS connect timeout: ${this.peerId}`)), 10000);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.startHeartbeat();
        resolve();
      });
      this.ws.on('message', (raw) => this.handleMessage(raw.toString()));
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
        reject(err);
      });
      this.ws.on('close', () => { this.ws = undefined; });
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
          this.metrics.writeLatencySamples.push(latency);
          this.collector.recordAcked(this.peerId, pending.sentAt, latency);
        }
      }
    } catch { /* ignore */ }
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.isConnected) return;
      const msg = buildChatMessage(this.peerId, 'device-under-test', `stress-${this.metrics.sent}`);
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
