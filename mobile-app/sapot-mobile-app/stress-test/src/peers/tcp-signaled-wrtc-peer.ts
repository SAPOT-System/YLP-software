import net from 'net';
import nodeDatachannel, { Audio, Video } from 'node-datachannel';
import type { DataChannel, Track } from 'node-datachannel';
import { encodeBase64 } from 'tweetnacl-util';
import {
  generateKeyPair,
  computeSharedKey,
  encryptMessage,
  decryptMessage,
  buildHandshakeAck,
  parsePublicKey,
  buildTcpSignalPayload,
  isTcpSignalPayload,
  SignalMessage,
  EncryptedEnvelope,
} from '../protocol/tcp-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';
import { WebrtcConfig } from '../orchestrator/test-config';
import { buildRtpPacket, buildVideoRtpPacket } from './rtp-utils';

export class TcpSignaledWrtcPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;

  private server: net.Server;
  private _port: number;

  private serverSocket?: net.Socket;
  private serverSharedKey?: Uint8Array;
  private serverHandshakeDone = false;
  private serverReceiveBuffer = '';

  private clientSocket?: net.Socket;
  private clientSharedKey?: Uint8Array;

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
  private readonly videoSsrc = Math.floor(Math.random() * 0xffffffff);

  private sendTimer: NodeJS.Timeout | null = null;
  private seqNo = 0;
  private metrics: PeerMetrics = emptyMetrics();

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly hostIp: string,
    port: number,
    private readonly collector: MetricsCollector,
    private readonly config: WebrtcConfig,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
    this._port = port;
    this.server = net.createServer();
  }

  get port(): number { return this._port; }
  private get isOfferer(): boolean { return this.peerIndex % 2 === 0; }

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.server.off('error', onError);
        const addr = this.server.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        this.server.on('connection', (socket) => this.handleInbound(socket));
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this._port, '0.0.0.0');
    });
  }

  connectTo(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const startMs = Date.now();
      const timeoutMs = this.config.connectionTimeoutMs ?? 15_000;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.metrics.connectionTimeouts++;
        this.metrics.connectionErrors++;
        this.collector.recordConnectionTimeout();
        this.collector.recordConnectionError();
        resolve();
      }, timeoutMs);

      const kp = generateKeyPair();
      const socket = net.createConnection({ host, port }, () => {
        socket.write(
          JSON.stringify({ type: 'handshake-init', pub: encodeBase64(kp.publicKey) }) + '\n',
        );
      });
      let buf = '';

      socket.on('data', (raw) => {
        buf += raw.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line) as Record<string, unknown>;
            if (frame['type'] === 'handshake-ack' && !this.clientSocket) {
              const sharedKey = computeSharedKey(kp.secretKey, parsePublicKey(frame['pub'] as string));
              this.clientSocket = socket;
              this.clientSharedKey = sharedKey;
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
                startMs,
                (msg) => this.sendViaClient(msg),
              );
            } else if (frame['type'] === 'encrypted' && this.clientSharedKey) {
              const msg = decryptMessage(this.clientSharedKey, frame as unknown as EncryptedEnvelope);
              if (isTcpSignalPayload(msg)) this.receiveSignal(msg.signal);
            }
          } catch { /* ignore malformed frames */ }
        }
      });

      socket.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
        resolve();
      });

      socket.on('close', () => {
        this.clientSocket = undefined;
        this.clientSharedKey = undefined;
      });
    });
  }

  private handleInbound(socket: net.Socket): void {
    this.serverSocket = socket;
    const kp = generateKeyPair();
    this.serverReceiveBuffer = '';
    this.serverHandshakeDone = false;
    let iceStartMs = 0;

    socket.on('data', (raw) => {
      this.serverReceiveBuffer += raw.toString('utf8');
      const lines = this.serverReceiveBuffer.split('\n');
      this.serverReceiveBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line) as Record<string, unknown>;
          if (!this.serverHandshakeDone) {
            if (frame['type'] !== 'handshake-init') return;
            this.serverSharedKey = computeSharedKey(
              kp.secretKey,
              parsePublicKey(frame['pub'] as string),
            );
            socket.write(JSON.stringify(buildHandshakeAck(kp.publicKey)) + '\n');
            this.serverHandshakeDone = true;
          } else if (frame['type'] === 'encrypted' && this.serverSharedKey) {
            const msg = decryptMessage(this.serverSharedKey, frame as unknown as EncryptedEnvelope);
            if (isTcpSignalPayload(msg)) {
              if (!this.pc) {
                iceStartMs = Date.now();
                this.createPc(
                  (elapsed) => {
                    this.metrics.iceEstablishMs.push(elapsed);
                    this.collector.recordIceEstablish(this.peerId, elapsed);
                  },
                  () => {
                    this.metrics.connectionErrors++;
                    this.collector.recordConnectionError();
                  },
                  iceStartMs,
                  (signal) => this.sendViaServer(signal),
                );
              }
              this.receiveSignal(msg.signal);
            }
          }
        } catch { /* ignore */ }
      }
    });

    socket.on('error', () => {
      this.metrics.connectionErrors++;
      this.collector.recordConnectionError();
    });
    socket.on('close', () => {
      this.serverSocket = undefined;
      this.serverHandshakeDone = false;
      this.serverSharedKey = undefined;
    });
  }

  private createPc(
    onConnected: (elapsedMs: number) => void,
    onFailed: () => void,
    startMs: number,
    sendSignal: (msg: SignalMessage) => void,
  ): void {
    const iceServers = (this.config.iceServers ?? []).map((s) => s.urls);
    const pc = new nodeDatachannel.PeerConnection(this.peerId, { iceServers });
    this.pc = pc;

    pc.onStateChange((state: string) => {
      if (state === 'connected') onConnected(Date.now() - startMs);
      else if (state === 'failed') onFailed();
    });

    pc.onLocalDescription((sdp: string, type: string) => {
      sendSignal({ type: type as 'offer' | 'answer', sdp });
    });

    pc.onLocalCandidate((candidate: string, mid: string) => {
      sendSignal({ type: 'candidate', candidate, mid });
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

    if (this.isOfferer) {
      const dc = pc.createDataChannel('chat');
      this.setupDataChannel(dc);
    } else {
      pc.onDataChannel((dc: DataChannel) => {
        this.setupDataChannel(dc);
      });
    }
  }

  private receiveSignal(signal: SignalMessage): void {
    if (!this.pc) return;
    if (signal.type === 'offer' || signal.type === 'answer') {
      this.pc.setRemoteDescription(signal.sdp, signal.type);
    } else if (signal.type === 'candidate') {
      this.pc.addRemoteCandidate(signal.candidate, signal.mid);
    }
  }

  private sendViaClient(msg: SignalMessage): void {
    if (!this.clientSocket || !this.clientSharedKey) return;
    try {
      const envelope = encryptMessage(
        this.clientSharedKey,
        buildTcpSignalPayload(msg) as unknown as Record<string, unknown>,
      );
      this.clientSocket.write(JSON.stringify(envelope) + '\n');
    } catch { /* socket closed */ }
  }

  private sendViaServer(msg: SignalMessage): void {
    if (!this.serverSocket || !this.serverSharedKey) return;
    try {
      const envelope = encryptMessage(
        this.serverSharedKey,
        buildTcpSignalPayload(msg) as unknown as Record<string, unknown>,
      );
      this.serverSocket.write(JSON.stringify(envelope) + '\n');
    } catch { /* socket closed */ }
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
      const bytesPerFrame = Math.floor((bitrate * 1000) / 8 / 30);
      this.videoTimer = setInterval(() => {
        try {
          const packet = buildVideoRtpPacket(this.videoSeq++, this.videoTimestamp, this.videoSsrc, bytesPerFrame);
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
    this.clientSocket?.destroy();
    this.serverSocket?.destroy();
    await Promise.race([
      new Promise<void>((res) => this.server.close(() => res())),
      new Promise<void>((res) => setTimeout(res, 500)),
    ]);
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
