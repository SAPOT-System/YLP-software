export interface Phase {
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
  totalMessages?: number;
  runIperf?: boolean;
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

export interface LoopbackControlConfig {
  /** Phases to run in loopback pair mode (tcp-signaled, 127.0.0.1) before the main star run. */
  phases: Phase[];
  /** First TCP port for loopback peers. Default 9100. */
  startPort?: number;
}

export interface TestConfig {
  mode: "tcp-signaled" | "ws-signaled";
  lan?: LanConfig;
  ws?: WsConfig;
  webrtc?: WebrtcConfig;
  phases: Phase[];
  outputDir: string;
  /** p95 event-loop lag threshold (ms). Phases exceeding this are flagged as laptop-saturated. Default 50. */
  lagThresholdMs?: number;
  /** Optional one-time loopback control run producing a laptop establishment ceiling. */
  loopbackControl?: LoopbackControlConfig;
}

export function validateConfig(config: TestConfig): void {
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
      (config.mode === "ws-signaled" && !config.ws?.phoneUserId) ||
      (config.mode === "tcp-signaled" && !config.lan?.phoneIp && !config.lan?.adbDiscovery);
    if (requiresEvenPeers && p.peerCount % 2 !== 0)
      throw new Error(`peerCount must be even for ${config.mode} mode`);
    if (p.msgPerSec < 1) throw new Error("msgPerSec must be >= 1");
    if (p.durationSec < 5) throw new Error("durationSec must be >= 5");
  }
}
