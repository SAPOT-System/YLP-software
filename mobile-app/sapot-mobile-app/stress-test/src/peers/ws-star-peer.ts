import WebSocket from 'ws';
import nodeDatachannel, { Audio, Video } from 'node-datachannel';
import type { DataChannel, Track } from 'node-datachannel';
import {
  fetchJwt,
  buildWsUrl,
  decodeToken,
  isPong,
} from '../protocol/ws-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';
import { WebrtcConfig } from '../orchestrator/test-config';
import { buildRtpPacket, buildVideoRtpPacket } from './rtp-utils';

/**
 * Star topology peer: authenticates with the WS server, then sends WebRTC
 * offers to the phone (phoneUserId) using the app's native signaling message
 * format so the phone's SignalingService can route and answer them.
 *
 * All WsStarPeer instances are offerers; the phone is the single hub/answerer.
 */
export class WsStarPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;

  private ws?: WebSocket;
  private myUserId?: string;
  private iceStartMs = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pc: any = null;
  private dc: DataChannel | null = null;

  private audioTrack: Track | null = null;
  private audioTimer: NodeJS.Timeout | null = null;
  private rtpSeq = 0;
  private rtpTimestamp = 0;
  private readonly rtpSsrc = Math.floor(Math.random() * 0xffffffff);

  private videoTrack: Track | null = null;
  private videoTimer: NodeJS.Timeout | null = null;
  private videoSeq = 0;
  private videoTimestamp = 0;
  private videoFrameIndex = 0;
  private readonly videoSsrc = Math.floor(Math.random() * 0xffffffff);

  private sendTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private seqNo = 0;
  private metrics: PeerMetrics = emptyMetrics();

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly serverUrl: string,
    private readonly collector: MetricsCollector,
    private readonly credentials: { username: string; password: string },
    private readonly phoneUserId: string,
    private readonly config: WebrtcConfig,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
  }

  get userId(): string | undefined { return this.myUserId; }

  async connect(): Promise<void> {
    let token: string;
    try {
      token = await fetchJwt(this.serverUrl, this.credentials.username, this.credentials.password);
    } catch (e) {
      this.metrics.connectionErrors++;
      this.collector.recordConnectionError();
      throw e;
    }
    this.myUserId = decodeToken(token).userId;
    const url = buildWsUrl(this.serverUrl, token);
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);
      const timeout = setTimeout(
        () => reject(new Error(`WS connect timeout: ${this.peerId}`)),
        10000,
      );
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

  /**
   * Sends a WebRTC offer to the phone and waits for ICE establishment.
   * The partnerUserId arg is ignored — this peer always targets phoneUserId.
   */
  negotiate(_partnerUserId?: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const timeoutMs = this.config.connectionTimeoutMs ?? 15_000;
      let settled = false;
      this.iceStartMs = Date.now();

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.metrics.connectionTimeouts++;
        this.collector.recordConnectionTimeout();
        resolve();
      }, timeoutMs);

      this.createPc(
        (elapsed) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.metrics.iceEstablishMs.push(elapsed);
          this.collector.recordIceEstablish(this.peerId, elapsed);
          resolve();
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.metrics.connectionErrors++;
          this.collector.recordConnectionError();
          resolve();
        },
        this.iceStartMs,
      );
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      if (isPong(msg)) return;

      const data = msg.data as Record<string, unknown> | undefined;
      if (!data || data['sender'] !== this.phoneUserId) return;

      const type = msg.type as string;

      if (type === 'answer' && this.pc) {
        const sdpObj = data['sdp'] as Record<string, unknown> | string | undefined;
        const sdpStr =
          typeof sdpObj === 'string' ? sdpObj :
          typeof sdpObj === 'object' && sdpObj !== null ? String(sdpObj['sdp'] ?? '') : '';
        if (sdpStr) this.pc.setRemoteDescription(sdpStr, 'answer');
        return;
      }

      if (type === 'ice-candidate' && this.pc) {
        const candidate = data['candidate'] as Record<string, unknown> | null | undefined;
        if (candidate?.['candidate']) {
          this.pc.addRemoteCandidate(
            String(candidate['candidate']),
            String(candidate['sdpMid'] ?? '0'),
          );
        }
      }
    } catch { /* ignore malformed frames */ }
  }

  private sendOffer(sdp: string): void {
    if (!this.ws || !this.myUserId) return;
    try {
      this.ws.send(JSON.stringify({
        type: 'offer',
        data: {
          to: this.phoneUserId,
          sender: this.myUserId,
          sdp: { type: 'offer', sdp },
          ipAddress: '0.0.0.0',
          port: 0,
        },
      }));
    } catch { /* ws closed */ }
  }

  private sendCandidate(candidate: string, mid: string): void {
    if (!this.ws || !this.myUserId) return;
    try {
      this.ws.send(JSON.stringify({
        type: 'ice-candidate',
        data: {
          to: this.phoneUserId,
          sender: this.myUserId,
          candidate: { candidate, sdpMid: mid, sdpMLineIndex: 0 },
          ipAddress: '0.0.0.0',
          port: 0,
        },
      }));
    } catch { /* ws closed */ }
  }

  private createPc(
    onConnected: (elapsedMs: number) => void,
    onFailed: () => void,
    startMs: number,
  ): void {
    const iceServers = (this.config.iceServers ?? []).map((s) => s.urls);
    const pc = new nodeDatachannel.PeerConnection(this.peerId, { iceServers });
    this.pc = pc;

    pc.onStateChange((state: string) => {
      if (state === 'connected') onConnected(Date.now() - startMs);
      else if (state === 'failed') onFailed();
    });

    pc.onLocalDescription((sdp: string, type: string) => {
      if (type === 'offer') this.sendOffer(sdp);
    });

    pc.onLocalCandidate((candidate: string, mid: string) => {
      this.sendCandidate(candidate, mid);
    });

    if (this.config.media) {
      try {
        const audio = new Audio('audio', 'SendOnly');
        audio.addOpusCodec(111);
        const track = pc.addTrack(audio) as Track;
        this.setupAudioTrack(track);
      } catch { /* media not supported */ }
      if (this.config.media.type === 'audio-video') {
        try {
          const video = new Video('video', 'SendOnly');
          video.addH264Codec(96);
          this.videoTrack = pc.addTrack(video) as Track;
        } catch { /* video not supported */ }
      }
    }

    // Always offerer — create the data channel.
    const dc = pc.createDataChannel('chat');
    this.setupDataChannel(dc);
  }

  private setupDataChannel(dc: DataChannel): void {
    this.dc = dc;
    dc.onMessage((msg: string | ArrayBuffer | Buffer) => {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg as ArrayBuffer).toString();
      // Handle ACK if phone responds (it may not for non-app messages).
      if (raw.startsWith('ACK:')) {
        const parts = raw.split(':');
        const sentAt = parseInt(parts[2], 10);
        const latencyMs = Date.now() - sentAt;
        this.metrics.acked++;
        this.metrics.writeLatencySamples.push(latencyMs);
        this.collector.recordAcked(this.peerId, sentAt, latencyMs);
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
          if (ok) { this.metrics.rtpPacketsSent++; this.collector.recordRtpSent(this.peerId); }
          else { this.metrics.rtpPacketsLost++; this.collector.recordRtpLost(this.peerId); }
        } catch { /* track closed */ }
      }, 20);
    }

    if (this.videoTrack) {
      const bitrate = this.config.media?.bitrate ?? 1000;
      const avgBytesPerFrame = Math.floor((bitrate * 1000) / 8 / 30);
      this.videoTimer = setInterval(() => {
        try {
          const packet = buildVideoRtpPacket(this.videoSeq++, this.videoTimestamp, this.videoSsrc, avgBytesPerFrame, this.videoFrameIndex++);
          this.videoTimestamp += 3000;
          const ok = this.videoTrack?.sendMessageBinary(packet) ?? false;
          if (ok) { this.metrics.rtpPacketsSent++; this.collector.recordRtpSent(this.peerId); }
          else { this.metrics.rtpPacketsLost++; this.collector.recordRtpLost(this.peerId); }
        } catch { /* track closed */ }
      }, 33);
    }
  }

  stopSending(): void {
    if (this.sendTimer !== null) { clearInterval(this.sendTimer); this.sendTimer = null; }
    if (this.audioTimer !== null) { clearInterval(this.audioTimer); this.audioTimer = null; }
    if (this.videoTimer !== null) { clearInterval(this.videoTimer); this.videoTimer = null; }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    clearInterval(this.heartbeatTimer);
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
    if (this.ws) {
      this.ws.close(1000, 'stress_test_done');
      await new Promise<void>((res) => {
        this.ws?.once('close', () => res());
        setTimeout(res, 2000);
      });
    }
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
