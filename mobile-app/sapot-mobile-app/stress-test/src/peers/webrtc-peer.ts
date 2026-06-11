import nodeDatachannel from 'node-datachannel';
import type { DataChannel } from 'node-datachannel';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';
import { WebrtcConfig } from '../orchestrator/test-config';

export type SignalMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: string; mid: string };

export class WrtcPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  sendSignal: (msg: SignalMessage) => void = () => {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pc: any = null;
  private dc: DataChannel | null = null;
  private sendTimer: NodeJS.Timeout | null = null;
  private metrics: PeerMetrics = emptyMetrics();
  private seqNo = 0;

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly collector: MetricsCollector,
    private readonly config: WebrtcConfig,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
  }

  private get isOfferer(): boolean {
    return this.peerIndex % 2 === 0;
  }

  receiveSignal(msg: SignalMessage): void {
    if (!this.pc) return;
    if (msg.type === 'offer' || msg.type === 'answer') {
      this.pc.setRemoteDescription(msg.sdp, msg.type);
    } else if (msg.type === 'candidate') {
      this.pc.addRemoteCandidate(msg.candidate, msg.mid);
    }
  }

  connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      const startMs = Date.now();
      const timeoutMs = this.config.connectionTimeoutMs ?? 10_000;

      const timer = setTimeout(() => {
        this.metrics.connectionTimeouts++;
        this.metrics.connectionErrors++;
        this.collector.recordConnectionTimeout();
        resolve();
      }, timeoutMs);

      const iceServers = (this.config.iceServers ?? []).map((s) => s.urls);
      const pc = new nodeDatachannel.PeerConnection(this.peerId, { iceServers });
      this.pc = pc;

      pc.onStateChange((state: string) => {
        if (state === 'connected') {
          clearTimeout(timer);
          const elapsed = Date.now() - startMs;
          this.metrics.iceEstablishMs.push(elapsed);
          this.collector.recordIceEstablish(this.peerId, elapsed);
          resolve();
        } else if (state === 'failed' || state === 'closed') {
          clearTimeout(timer);
          this.metrics.connectionErrors++;
          resolve();
        }
      });

      pc.onLocalDescription((sdp: string, type: string) => {
        this.sendSignal({ type: type as 'offer' | 'answer', sdp });
      });

      pc.onLocalCandidate((candidate: string, mid: string) => {
        this.sendSignal({ type: 'candidate', candidate, mid });
      });

      if (this.isOfferer) {
        const dc = pc.createDataChannel('chat');
        this.setupDataChannel(dc);
      } else {
        pc.onDataChannel((dc: DataChannel) => {
          this.setupDataChannel(dc);
        });
      }
    });
  }

  private setupDataChannel(dc: DataChannel): void {
    this.dc = dc;
    dc.onMessage((msg: string | ArrayBuffer | Buffer) => {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg as ArrayBuffer).toString();
      if (raw.startsWith('MSG:')) {
        const parts = raw.split(':');
        if (dc.isOpen()) dc.sendMessage(`ACK:${parts[1]}:${parts[2]}`);
      } else if (raw.startsWith('ACK:')) {
        const parts = raw.split(':');
        const sentAt = parseInt(parts[2], 10);
        const latencyMs = Date.now() - sentAt;
        this.metrics.acked++;
        this.metrics.writeLatencySamples.push(latencyMs);
        this.collector.recordAcked(this.peerId, sentAt, latencyMs);
      }
    });
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1_000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.dc?.isOpen()) return;
      const sentAt = Date.now();
      const ok = this.dc.sendMessage(`MSG:${this.seqNo++}:${sentAt}`);
      if (ok) {
        this.metrics.sent++;
        this.collector.recordSent(this.peerId, sentAt);
      } else {
        this.metrics.dropped++;
        this.collector.recordDropped(this.peerId);
      }
    }, intervalMs);
  }

  stopSending(): void {
    if (this.sendTimer !== null) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    try { this.dc?.close(); } catch { /* ignore */ }
    this.dc = null;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
      try { this.pc?.close(); } catch { /* ignore */ }
    });
    this.pc = null;
  }

  getMetrics(): PeerMetrics {
    return {
      ...this.metrics,
      writeLatencySamples: [...this.metrics.writeLatencySamples],
      iceEstablishMs: [...this.metrics.iceEstablishMs],
      mediaEstablishMs: [...this.metrics.mediaEstablishMs],
    };
  }
}
