export interface Phase {
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
  totalMessages?: number;
  runIperf?: boolean;
}

export interface LanConfig {
  /** Laptop's WiFi IP — included in handshake so the phone knows where to dial back. Auto-detected when mdnsDiscovery is true. */
  hostIp?: string;
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
  /**
   * Auto-discover phoneIp/phonePort/phoneUserId by listening for the phone's
   * _lanchat._tcp.local. mDNS beacon. Does not require USB/adb.
   * When true, manual phoneIp/phonePort/phoneUserId fields are ignored.
   */
  mdnsDiscovery?: boolean;
}

export interface WsConfig {
  serverUrl: string;
  accountPrefix: string;
  password: string;
  iperfTargetIp: string;
  /** Star topology: the phone's user ID. All ws-signaled peers target this user instead of pairing with each other. */
  phoneUserId?: string;
  /**
   * Auto-discover phoneUserId by listening for the phone's _lanchat._tcp.local. mDNS beacon.
   * When true, a manual phoneUserId is not required.
   */
  mdnsDiscovery?: boolean;
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
  /** How long (seconds) to wait for phone discovery (adb or mDNS). Default 60. */
  discoveryTimeoutSec?: number;
}

export function validateConfig(config: TestConfig): void {
  const issues: string[] = [];

  if (config.mode === "tcp-signaled") {
    if (!config.lan) {
      issues.push("lan config is required for mode tcp-signaled");
    } else {
      if (!config.lan.hostIp && !config.lan.mdnsDiscovery) issues.push("lan.hostIp is required (or set lan.mdnsDiscovery=true to auto-detect)");
      if (config.lan.startPort === undefined) issues.push("lan.startPort is required");

      const isAdb = config.lan.adbDiscovery === true;
      const isMdns = config.lan.mdnsDiscovery === true;
      const hasPhoneIp = !!config.lan.phoneIp;
      const hasPhonePort = !!config.lan.phonePort;
      const hasPhoneUserId = !!config.lan.phoneUserId;

      if (!isAdb && !isMdns) {
        if (!hasPhoneIp) {
          issues.push(
            "tcp-signaled only supports Star Mode: set lan.adbDiscovery=true, lan.mdnsDiscovery=true, " +
            "or provide lan.phoneIp + lan.phonePort + lan.phoneUserId"
          );
        } else {
          if (!hasPhonePort) issues.push("lan.phonePort is required when lan.phoneIp is set");
          if (!hasPhoneUserId) issues.push("lan.phoneUserId is required when lan.phoneIp is set");
        }
      }
    }
    if (!config.webrtc) issues.push("webrtc config is required for mode tcp-signaled");
  }

  if (config.mode === "ws-signaled") {
    if (!config.ws) {
      issues.push("ws config is required for mode ws-signaled");
    } else {
      if (!config.ws.serverUrl) issues.push("ws.serverUrl is required");
      if (!config.ws.accountPrefix) issues.push("ws.accountPrefix is required");
      if (!config.ws.password) issues.push("ws.password is required");
      if (!config.ws.iperfTargetIp) issues.push("ws.iperfTargetIp is required");
    }
    if (!config.webrtc) issues.push("webrtc config is required for mode ws-signaled");
  }

  if (config.phases.length === 0) issues.push("at least one phase is required");

  for (const p of config.phases) {
    if (p.peerCount < 1) issues.push("peerCount must be >= 1");
    const requiresEvenPeers = config.mode === "ws-signaled" && !config.ws?.phoneUserId && !config.ws?.mdnsDiscovery;
    if (requiresEvenPeers && p.peerCount % 2 !== 0)
      issues.push("peerCount must be even for ws-signaled pair mode");
    if (p.msgPerSec < 1) issues.push("msgPerSec must be >= 1");
    if (p.durationSec < 5) issues.push("durationSec must be >= 5");
  }

  if (issues.length > 0) {
    console.warn(`\nConfig validation failed — ${issues.length} required field(s) missing or invalid:`);
    issues.forEach((msg, i) => console.warn(`  [${i + 1}] ${msg}`));
    console.warn("");
    const detail = issues.map((msg, i) => `  [${i + 1}] ${msg}`).join("\n");
    throw new Error(`Config validation failed — ${issues.length} issue(s):\n${detail}`);
  }
}
