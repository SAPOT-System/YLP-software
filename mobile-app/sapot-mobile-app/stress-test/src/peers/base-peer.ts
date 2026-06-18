export interface PeerMetrics {
  sent: number;
  acked: number;
  // Local send-queue backpressure (sendMessage returned false), NOT network loss.
  txQueueOverflow: number;
  writeLatencySamples: number[];
  connectionErrors: number;
  iceEstablishMs: number[];
  connectionTimeouts: number;
  rtpPacketsSent: number;
  dcEstablishMs: number[];
  iceStateTransitions: Array<{ state: string; elapsedMs: number }>;
  audioEstablishMs: number[];
  videoEstablishMs: number[];
  connectedAtPhaseEnd: boolean;
}

export interface BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  connect(): Promise<void>;
  startSending(msgPerSec: number, totalMessages?: number): void;
  stopSending(): void;
  disconnect(): Promise<void>;
  getMetrics(): PeerMetrics;
}

export function emptyMetrics(): PeerMetrics {
  return {
    sent: 0,
    acked: 0,
    txQueueOverflow: 0,
    writeLatencySamples: [],
    connectionErrors: 0,
    iceEstablishMs: [],
    connectionTimeouts: 0,
    rtpPacketsSent: 0,
    dcEstablishMs: [],
    iceStateTransitions: [],
    audioEstablishMs: [],
    videoEstablishMs: [],
    connectedAtPhaseEnd: false,
  };
}
