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
  /** Star topology: phone's WiFi IP. All tcp-signaled peers connect to the phone instead of pairing on loopback. */
  phoneIp?: string;
  /** Star topology: phone's TCP server port (required when phoneIp is set). */
  phonePort?: number;
  /** Star topology: phone's userId (required when phoneIp is set — needed so the phone's SignalingService routes the offer). */
  phoneUserId?: string;
  /**
   * Auto-discover phoneIp/phonePort/phoneUserId via adb logcat at run time.
   * When true, manual phoneIp/phonePort/phoneUserId fields are ignored.
   */
  adbDiscovery?: boolean;
}

export interface WsConfig {
  serverUrl: string;
  accountPrefix: string;
  password: string;
  iperfTargetIp: string;
  /** Star topology: the phone's user ID. All ws-signaled peers target this user instead of pairing with each other. */
  phoneUserId?: string;
}

export interface WebrtcConfig {
  iceServers?: { urls: string }[];
  connectionTimeoutMs?: number;
  iperfTargetIp?: string;
  media?: {
    type: "audio" | "audio-video";
    bitrate?: number;
  };
}

export interface TestConfig {
  mode: "lan" | "ws" | "both" | "webrtc" | "tcp-signaled" | "ws-signaled";
  lan?: LanConfig;
  ws?: WsConfig;
  webrtc?: WebrtcConfig;
  phases: Phase[];
  outputDir: string;
}

export function validateConfig(config: TestConfig): void {
  if ((config.mode === "lan" || config.mode === "both") && !config.lan)
    throw new Error("lan config required for mode lan/both");
  if ((config.mode === "ws" || config.mode === "both") && !config.ws)
    throw new Error("ws config required for mode ws/both");
  if (config.mode === "webrtc" && !config.webrtc)
    throw new Error("webrtc config required for mode webrtc");
  if (config.mode === "tcp-signaled") {
    if (!config.lan) throw new Error("lan config required for mode tcp-signaled");
    if (!config.webrtc) throw new Error("webrtc config required for mode tcp-signaled");
    if (config.lan.phoneIp && !config.lan.phonePort)
      throw new Error("lan.phonePort required when lan.phoneIp is set (tcp-signaled star mode)");
    if (config.lan.phoneIp && !config.lan.phoneUserId)
      throw new Error("lan.phoneUserId required when lan.phoneIp is set (phone's SignalingService checks the 'to' field)");
  }
  if (config.mode === "ws-signaled") {
    if (!config.ws) throw new Error("ws config required for mode ws-signaled");
    if (!config.webrtc) throw new Error("webrtc config required for mode ws-signaled");
  }
  if (config.phases.length === 0)
    throw new Error("at least one phase required");
  for (const p of config.phases) {
    if (p.peerCount < 1) throw new Error("peerCount must be >= 1");
    const requiresEvenPeers =
      config.mode === "webrtc" ||
      (config.mode === "ws-signaled" && !config.ws?.phoneUserId) ||
      (config.mode === "tcp-signaled" && !config.lan?.phoneIp && !config.lan?.adbDiscovery);
    if (requiresEvenPeers && p.peerCount % 2 !== 0)
      throw new Error(`peerCount must be even for ${config.mode} mode`);
    if (p.msgPerSec < 1) throw new Error("msgPerSec must be >= 1");
    if (p.durationSec < 5) throw new Error("durationSec must be >= 5");
    if (p.iperfLoadMbps !== undefined && p.iperfLoadMbps < 0)
      throw new Error("iperfLoadMbps must be >= 0");
  }
}
