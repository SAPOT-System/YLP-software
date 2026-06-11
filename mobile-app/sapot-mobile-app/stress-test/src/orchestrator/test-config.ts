export interface Phase {
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
  iperfLoadMbps?: number;
}

export interface LanConfig {
  hostIp: string;
  startPort: number;
  iperfTargetIp?: string;
}

export interface WsConfig {
  serverUrl: string;
  accountPrefix: string;
  password: string;
}

export interface WebrtcConfig {
  iceServers?: { urls: string }[];
  connectionTimeoutMs?: number;
  media?: {
    type: 'audio' | 'audio-video';
    bitrate?: number;
  };
}

export interface TestConfig {
  mode: 'lan' | 'ws' | 'both' | 'webrtc';
  lan?: LanConfig;
  ws?: WsConfig;
  webrtc?: WebrtcConfig;
  phases: Phase[];
  outputDir: string;
}

export function validateConfig(config: TestConfig): void {
  if ((config.mode === 'lan' || config.mode === 'both') && !config.lan)
    throw new Error('lan config required for mode lan/both');
  if ((config.mode === 'ws' || config.mode === 'both') && !config.ws)
    throw new Error('ws config required for mode ws/both');
  if (config.mode === 'webrtc' && !config.webrtc)
    throw new Error('webrtc config required for mode webrtc');
  if (config.phases.length === 0) throw new Error('at least one phase required');
  for (const p of config.phases) {
    if (p.peerCount < 1) throw new Error('peerCount must be >= 1');
    if (config.mode === 'webrtc' && p.peerCount % 2 !== 0)
      throw new Error('peerCount must be even for webrtc mode');
    if (p.msgPerSec < 1) throw new Error('msgPerSec must be >= 1');
    if (p.durationSec < 5) throw new Error('durationSec must be >= 5');
    if (p.iperfLoadMbps !== undefined && p.iperfLoadMbps < 0) throw new Error('iperfLoadMbps must be >= 0');
  }
}
