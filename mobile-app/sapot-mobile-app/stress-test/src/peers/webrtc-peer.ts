import nodeDatachannel, { Audio, Video } from 'node-datachannel';
import type { DataChannel, Track } from 'node-datachannel';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';
import { WebrtcConfig } from '../orchestrator/test-config';
import { SignalMessage } from '../protocol/tcp-protocol';
import { buildRtpPacket, buildVideoRtpPacket } from './rtp-utils';
export type { SignalMessage };

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

  private audioTrack: Track | null = null;
  private audioTimer: NodeJS.Timeout | null = null;
  private rtpSeq = 0;
  private rtpTimestamp = 0;
  private readonly rtpSsrc = Math.floor(Math.random() * 0xffffffff);

  private videoTrack: Track | null = null;
  private videoTimer: NodeJS.Timeout | null = null;
  private videoSeq = 0;
  private videoTimestamp = 0;
  private readonly videoSsrc = Math.floor(Math.random() * 0xffffffff);

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

      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.metrics.connectionTimeouts++;
        this.metrics.connectionErrors++;
        this.collector.recordConnectionTimeout();
        this.collector.recordConnectionError();
        try { pc.close(); } catch { /* ignore */ }
        resolve();
      }, timeoutMs);

      const iceServers = (this.config.iceServers ?? []).map((s) => s.urls);
      const pc = new nodeDatachannel.PeerConnection(this.peerId, { iceServers });
      this.pc = pc;

      pc.onStateChange((state: string) => {
        if (settled) return;
        if (state === 'connected') {
          settled = true;
          clearTimeout(timer);
          const elapsed = Date.now() - startMs;
          this.metrics.iceEstablishMs.push(elapsed);
          this.collector.recordIceEstablish(this.peerId, elapsed);
          resolve();
        } else if (state === 'failed') {
          settled = true;
          clearTimeout(timer);
          this.metrics.connectionErrors++;
          this.collector.recordConnectionError();
          resolve();
        }
        // 'closed' during normal disconnect is not an error — ignore it
      });

      pc.onLocalDescription((sdp: string, type: string) => {
        this.sendSignal({ type: type as 'offer' | 'answer', sdp });
      });

      pc.onLocalCandidate((candidate: string, mid: string) => {
        this.sendSignal({ type: 'candidate', candidate, mid });
      });

      if (this.config.media) {
        try {
          // node-datachannel requires a media-description instance (Audio/Video),
          // not a string — passing strings throws "Media class instance expected".
          const audio = new Audio('audio', 'SendOnly');
          audio.addOpusCodec(111);
          const track = pc.addTrack(audio) as Track;
          this.setupAudioTrack(track);
        } catch {
          // node-datachannel build without media support — skip silently
        }
        if (this.config.media.type === 'audio-video') {
          try {
            const video = new Video('video', 'SendOnly');
            video.addH264Codec(96);
            this.videoTrack = pc.addTrack(video) as Track;
          } catch {
            // skip if not supported
          }
        }
      }

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

  private setupAudioTrack(track: Track): void {
    this.audioTrack = track;
    const startMs = Date.now();
    track.onOpen(() => {
      const elapsed = Date.now() - startMs;
      this.metrics.mediaEstablishMs.push(elapsed);
      this.collector.recordMediaEstablish(this.peerId, elapsed);
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

    if (this.audioTrack) {
      this.audioTimer = setInterval(() => {
        try {
          const packet = buildRtpPacket(this.rtpSeq++, this.rtpTimestamp, this.rtpSsrc);
          this.rtpTimestamp += 960;
          const ok = this.audioTrack?.sendMessageBinary(packet) ?? false;
          if (ok) {
            this.metrics.rtpPacketsSent++;
            this.collector.recordRtpSent(this.peerId);
          } else {
            this.metrics.rtpPacketsLost++;
            this.collector.recordRtpLost(this.peerId);
          }
        } catch {
          // track may have closed
        }
      }, 20);
    }

    if (this.videoTrack) {
      const bitrate = this.config.media?.bitrate ?? 1000;
      const bytesPerFrame = Math.floor((bitrate * 1000) / 8 / 30);
      this.videoTimer = setInterval(() => {
        try {
          const packet = buildVideoRtpPacket(
            this.videoSeq++,
            this.videoTimestamp,
            this.videoSsrc,
            bytesPerFrame,
          );
          this.videoTimestamp += 3000;
          const ok = this.videoTrack?.sendMessageBinary(packet) ?? false;
          if (ok) {
            this.metrics.rtpPacketsSent++;
            this.collector.recordRtpSent(this.peerId);
          } else {
            this.metrics.rtpPacketsLost++;
            this.collector.recordRtpLost(this.peerId);
          }
        } catch {
          // track may have closed
        }
      }, 33);
    }
  }

  stopSending(): void {
    if (this.sendTimer !== null) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    if (this.audioTimer !== null) {
      clearInterval(this.audioTimer);
      this.audioTimer = null;
    }
    if (this.videoTimer !== null) {
      clearInterval(this.videoTimer);
      this.videoTimer = null;
    }
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.audioTrack?.close(); } catch { /* ignore */ }
    try { this.videoTrack?.close(); } catch { /* ignore */ }
    this.audioTrack = null;
    this.videoTrack = null;
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
