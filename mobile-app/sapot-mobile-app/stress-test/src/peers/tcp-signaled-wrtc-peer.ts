import net from 'net';
import nodeDatachannel, { Audio, Video } from 'node-datachannel';
import type { DataChannel, Track } from 'node-datachannel';
import type { CiaoService } from '@homebridge/ciao';
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

  // null in star mode — peer only dials out to the phone, never accepts inbound.
  private server: net.Server | null;
  private _port: number;

  private serverSocket?: net.Socket;
  private serverSharedKey?: Uint8Array;
  private serverHandshakeDone = false;
  private serverReceiveBuffer = '';
  // Resolves when the phone dials back and completes the NaCl handshake with our server.
  private serverHandshakePromise: Promise<void> | null = null;
  private serverHandshakeResolve: (() => void) | null = null;

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
  private videoFrameIndex = 0;
  private readonly videoSsrc = Math.floor(Math.random() * 0xffffffff);

  private sendTimer: NodeJS.Timeout | null = null;
  private seqNo = 0;
  private metrics: PeerMetrics = emptyMetrics();
  private mdnsService?: CiaoService;
  private advertiseMs?: number;

  constructor(
    peerId: string,
    peerIndex: number,
    port: number,
    private readonly collector: MetricsCollector,
    private readonly config: WebrtcConfig,
    private readonly phoneTarget?: { ip: string; port: number; userId: string; myIp: string },
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
    this._port = port;
    // Star mode: start a server so the phone can dial back after receiving the handshake
    // message (the app reads ipAddress/port from it and opens a TcpClientAdapter back).
    this.server = net.createServer();
    if (phoneTarget) {
      this.serverHandshakePromise = new Promise<void>((resolve) => {
        this.serverHandshakeResolve = resolve;
      });
    }
  }

  get port(): number { return this._port; }

  // In star mode all peers are offerers (they dial the phone).
  // In pair mode even-indexed peers are offerers.
  private get isOfferer(): boolean {
    return this.phoneTarget ? true : this.peerIndex % 2 === 0;
  }

  connect(): Promise<void> {
    const server = this.server!;
    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        const addr = server.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        server.on('connection', (socket) => this.handleInbound(socket));
        if (this.phoneTarget) {
          void this.advertiseMdns(this.phoneTarget.myIp);
          // Star mode: after server is up, dial the phone so it receives the offer
          // (which includes our server IP+port so the phone can dial back).
          this.connectTo(this.phoneTarget.ip, this.phoneTarget.port).catch(() => {});
        }
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this._port, '0.0.0.0');
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
      // In star mode (dialing the phone), include peerId and appPub so the phone:
      // (a) knows our identity, (b) stores our ECDH key in peerKeyStore which unblocks
      // ICE candidate processing (SignalingService buffers ICE until the key is known).
      const handshake: Record<string, unknown> = { type: 'handshake-init', pub: encodeBase64(kp.publicKey) };
      if (this.phoneTarget) {
        handshake['userId'] = this.peerId;
        handshake['appPub'] = encodeBase64(kp.publicKey);
      }

      const socket = net.createConnection({ host, port }, () => {
        socket.write(JSON.stringify(handshake) + '\n');
      });
      let buf = '';

      // Choose send and receive format based on mode:
      // - star mode (phoneTarget set): use app-native SignalingMessage format so the phone's
      //   SignalingService can route and process the offer/candidates correctly.
      // - pair mode: use stress-test's TcpSignalPayload format (peers-only loop).
      const isStarMode = !!this.phoneTarget;

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
              const sendFn = isStarMode
                ? (msg: SignalMessage) => this.sendAppFormatViaClient(msg)
                : (msg: SignalMessage) => this.sendViaClient(msg);

              const onConnected = (elapsed: number) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.metrics.iceEstablishMs.push(elapsed);
                this.collector.recordIceEstablish(this.peerId, elapsed);
                resolve();
              };
              const onFailed = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.metrics.connectionErrors++;
                this.collector.recordConnectionError();
                resolve();
              };
              const doCreatePc = () => {
                if (settled) return;
                this.createPc(onConnected, onFailed, startMs, sendFn);
              };

              if (isStarMode && this.phoneTarget) {
                // Send the app-level handshake message BEFORE the offer so the phone
                // dials back to our TCP server. The phone's SignalingService handles
                // "handshake" by calling TcpClientAdapter.connect(ipAddress, port) and
                // adding us to peerForceTcp. Without this, the phone has no TCP client
                // connection to us and silently drops the answer (sendMessage sees
                // adapter.isConnected = false and returns).
                const appHandshake: Record<string, unknown> = {
                  type: 'handshake',
                  data: {
                    to: this.phoneTarget.userId,
                    sender: this.peerId,
                    ipAddress: this.phoneTarget.myIp,
                    port: this._port,
                    wsAllowed: false,
                  },
                };
                try {
                  const envelope = encryptMessage(sharedKey, appHandshake);
                  socket.write(JSON.stringify(envelope) + '\n');
                } catch { /* socket closed */ }

                // Wait for the phone to dial back and complete the NaCl handshake
                // with our server before generating the offer. This ensures the return
                // path exists when the phone sends the answer.
                const waitMs = Math.min(3000, (this.config.connectionTimeoutMs ?? 15_000) / 5);
                Promise.race([
                  this.serverHandshakePromise ?? Promise.resolve(),
                  new Promise<void>((res) => setTimeout(res, waitMs)),
                ]).then(doCreatePc);
              } else {
                doCreatePc();
              }
            } else if (frame['type'] === 'encrypted' && this.clientSharedKey) {
              const msg = decryptMessage(this.clientSharedKey, frame as unknown as EncryptedEnvelope);
              if (isStarMode) {
                this.receiveAppFormatSignal(msg);
              } else if (isTcpSignalPayload(msg)) {
                this.receiveSignal(msg.signal);
              }
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
            // In star mode: signal that the phone has dialed back so connectTo can proceed
            // to create the PC (and thus generate the offer).
            this.serverHandshakeResolve?.();
          } else if (frame['type'] === 'encrypted' && this.serverSharedKey) {
            const msg = decryptMessage(this.serverSharedKey, frame as unknown as EncryptedEnvelope);
            if (this.phoneTarget) {
              // Star mode: the phone's answer/ICE arrives in app-native format over
              // the callback TCP connection it dialed back to us on.
              this.receiveAppFormatSignal(msg);
            } else if (isTcpSignalPayload(msg)) {
              // Pair mode: peer-to-peer stress-test format.
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

    let socketErrored = false;
    socket.on('error', () => {
      socketErrored = true;
      this.metrics.connectionErrors++;
      this.collector.recordConnectionError();
    });
    socket.on('close', () => {
      if (!this.serverHandshakeDone && !socketErrored && this.advertiseMs !== undefined) {
        const latencyMs = Date.now() - this.advertiseMs;
        this.collector.recordDiscoveryProbe(this.peerId, latencyMs);
      }
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

  // Sends in the app's native SignalingMessage format so the phone's SignalingService
  // can route the offer/candidate correctly (checks `data.to === userStore.user.id`).
  private sendAppFormatViaClient(msg: SignalMessage): void {
    if (!this.clientSocket || !this.clientSharedKey || !this.phoneTarget) return;
    let payload: Record<string, unknown>;
    if (msg.type === 'candidate') {
      payload = {
        type: 'ice-candidate',
        data: {
          to: this.phoneTarget.userId,
          sender: this.peerId,
          candidate: { candidate: msg.candidate, sdpMid: msg.mid, sdpMLineIndex: 0 },
          ipAddress: this.phoneTarget.myIp,
          port: this._port,
        },
      };
    } else {
      payload = {
        type: msg.type,
        data: {
          to: this.phoneTarget.userId,
          sender: this.peerId,
          sdp: { type: msg.type, sdp: msg.sdp },
          ipAddress: this.phoneTarget.myIp,
          port: this._port,
        },
      };
    }
    try {
      const envelope = encryptMessage(this.clientSharedKey, payload);
      this.clientSocket.write(JSON.stringify(envelope) + '\n');
    } catch { /* socket closed */ }
  }

  // Parses the app's native SignalingMessage format from the phone (answer/ice-candidate).
  private receiveAppFormatSignal(msg: unknown): void {
    if (typeof msg !== 'object' || msg === null) return;
    const m = msg as Record<string, unknown>;
    const type = m['type'] as string | undefined;
    const data = m['data'] as Record<string, unknown> | undefined;
    if (!data) return;
    if (type === 'answer') {
      const sdpObj = data['sdp'] as Record<string, unknown> | string | undefined;
      const sdpStr =
        typeof sdpObj === 'string' ? sdpObj :
        typeof sdpObj === 'object' && sdpObj !== null ? String(sdpObj['sdp'] ?? '') : '';
      if (sdpStr && this.pc) this.pc.setRemoteDescription(sdpStr, 'answer');
    } else if (type === 'ice-candidate') {
      const cand = data['candidate'] as Record<string, unknown> | undefined;
      if (cand?.['candidate'] && this.pc) {
        this.pc.addRemoteCandidate(String(cand['candidate']), String(cand['sdpMid'] ?? '0'));
      }
    }
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

  private async advertiseMdns(myIp: string): Promise<void> {
    try {
      this.advertiseMs = Date.now();
      const { getResponder, Protocol } = await import('@homebridge/ciao');
      const responder = getResponder({ interface: myIp });
      this.mdnsService = responder.createService({
        name: this.peerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: 'lanchat' as any,
        protocol: Protocol.TCP,
        port: this._port,
        restrictedAddresses: [myIp],
        disabledIpv6: true,
        txt: {
          id: this.peerId,
          username: this.peerId,
          firstName: 'Stress',
          lastName: String(this.peerIndex),
          peerId: this.peerId,
        },
      });
      await this.mdnsService.advertise();
    } catch {
      /* mDNS unavailable in test/CI environments — non-fatal */
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
    if (this.mdnsService) {
      try {
        await Promise.race([
          this.mdnsService.end(),
          new Promise<void>((res) => setTimeout(res, 500)),
        ]);
      } catch { /* ignore */ }
      this.mdnsService = undefined;
    }
    if (this.server) {
      await Promise.race([
        new Promise<void>((res) => this.server!.close(() => res())),
        new Promise<void>((res) => setTimeout(res, 500)),
      ]);
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
