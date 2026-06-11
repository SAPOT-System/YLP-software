export interface PeerMetrics {
  sent: number;
  acked: number;
  dropped: number;
  writeLatencySamples: number[];
  connectionErrors: number;
  wsPeakQueueFills: number;
}

export interface BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  connect(): Promise<void>;
  startSending(msgPerSec: number): void;
  stopSending(): void;
  disconnect(): Promise<void>;
  getMetrics(): PeerMetrics;
}

export function emptyMetrics(): PeerMetrics {
  return { sent: 0, acked: 0, dropped: 0, writeLatencySamples: [], connectionErrors: 0, wsPeakQueueFills: 0 };
}
