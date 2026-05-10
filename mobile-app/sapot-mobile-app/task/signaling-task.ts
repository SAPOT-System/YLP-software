import {
    backgroundLog,
    NetworkConfig,
    TcpServerAdapter,
    WsSignalingAdapter,
    ZeroconfAdapter,
} from "@/features/shared";
import {
    getAppAlive,
    getStoredAccessToken,
    getStoredFirstName,
    getStoredLastName,
    getStoredPeerId,
    getStoredUsername,
    getStoredWsUrl,
    saveAppAlive,
} from "@/features/shared/stores/secure-config";
import { CallMessage } from "@/features/shared/types";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Service } from "react-native-zeroconf";

export const SIGNALING_TASK = "SIGNALING_TASK";

// ── App-alive flag ─────────────────────────────────────────────────────────────
// MainContainer flips this true on initialize(), false on cleanup().
// Prevents background task from spinning up duplicate instances of services
// that ConnectionService and DiscoveryService already own when app is alive.
//
// _isAppAlive is an in-process cache for the foreground JS context.
// The background task runs in a separate JS context so it cannot read this
// variable — it reads the persisted value from secure store instead.

export const setAppAlive = (alive: boolean) => {
  saveAppAlive(alive); // persist across JS context boundary for background task
  if (alive) {
    // Free the TCP port and WS connection so ConnectionService can claim them.
    // Needed when the 15-min background task created bgTcpServer in the same
    // process and the main app then opens via notification tap.
    stopBackgroundOnlyServices();
  }
  backgroundLog.info("bg › app alive flag set", { alive });
};

// ── Background-only singletons ─────────────────────────────────────────────────
// Only instantiated when MainContainer is NOT running.
// When alive: ConnectionService owns TcpServerAdapter + WsSignalingAdapter
//             DiscoveryService owns ZeroconfAdapter

let bgNetworkConfig: NetworkConfig | null = null;
let bgTcpServer: TcpServerAdapter | null = null;
let bgWsAdapter: WsSignalingAdapter | null = null;
let bgZeroconf: ZeroconfAdapter | null = null;

// ── Incoming call notification ─────────────────────────────────────────────────

const showIncomingCallNotification = async (message: {
  callerName?: string;
  type: string;
  data: { from_user?: string; from?: string };
}) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📞 Incoming Call",
        body: `${message.callerName ?? message.data?.from_user} is calling...`,
        sound: "ringtone.mp3",
        data: {
          type: "incoming_call",
          // WS call message shape: { type, data: { from_user } }
          // TCP call message shape: { type, data: { from } }
          id: message.data?.from_user ?? message.data?.from,
          call_type: message.type === "video-call" ? "video" : "audio",
        },
      } as Notifications.NotificationContentInput,
      trigger: {
        channelId: "incoming-call",
      } as Notifications.NotificationTriggerInput,
    });
    backgroundLog.info("bg › incoming call notification shown");
  } catch (error) {
    backgroundLog.error("bg › show notification failed", { error });
  }
};

// ── Message handler — mirrors ConnectionService logic ─────────────────────────
// Handles both WS (WsCallMessage) and TCP (Message) shapes

const handleIncomingMessage = async (message: CallMessage) => {
  if (message.type === "audio-call" || message.type === "video-call") {
    await showIncomingCallNotification(message);
  }

  if (message.type === "call-ended" || message.type === "call-rejected") {
    // Dismiss any lingering incoming call notification in the tray
    try {
      const presented = await Notifications.getPresentedNotificationsAsync();
      for (const n of presented) {
        if (n.request.content.data?.type === "incoming_call") {
          await Notifications.dismissNotificationAsync(n.request.identifier);
        }
      }
      backgroundLog.info("bg › call ended/rejected — incoming notification dismissed");
    } catch (error) {
      backgroundLog.error("bg › dismiss notification failed", { error });
    }
  }
};

// ── Background-only service lifecycle ─────────────────────────────────────────

export const startBackgroundOnlyServices = async () => {
  // Fresh NetworkConfig every wake — no startWatching() in background
  bgNetworkConfig = new NetworkConfig();
  await bgNetworkConfig.initialize();

  const ip = bgNetworkConfig.ipAddress;
  const port = bgNetworkConfig.port;

  backgroundLog.info("bg › network ready", { port });

  // ── TCP Server ──────────────────────────────────────────────────────────────
  // Mirrors TcpServerAdapter usage in ConnectionService.start()
  const tcpNeedsRestart =
    !bgTcpServer ||
    bgTcpServer.currentPort !== port ||
    bgTcpServer.currentIp !== ip;

  if (tcpNeedsRestart) {
    bgTcpServer?.stop();
    bgTcpServer = new TcpServerAdapter();
    await bgTcpServer.start(port, ip);

    bgTcpServer.on("data", async (message: CallMessage) => {
      await handleIncomingMessage(message);
    });

    backgroundLog.info("bg › tcp server started", { port });
  }

  // ── WebSocket Signaling ─────────────────────────────────────────────────────
  // Mirrors WsSignalingAdapter usage in ConnectionService / SignalingService
  const wsUrl = await getStoredWsUrl();

  if (wsUrl && (!bgWsAdapter || !bgWsAdapter.isConnected)) {
    bgWsAdapter?.disconnect();
    bgWsAdapter = new WsSignalingAdapter();

    bgWsAdapter.on("call-message", async (message: CallMessage) => {
      await handleIncomingMessage(message);
    });

    bgWsAdapter.on("reconnect-failed", ({ attempts }: { attempts: number }) => {
      backgroundLog.warn("bg › ws reconnect failed", { attempts });
    });

    const token = await getStoredAccessToken();

    if (!token) return;

    bgWsAdapter.connect({
      baseUrl: wsUrl,
      token,
    });
    backgroundLog.info("bg › ws adapter connected");
  }

  // ── Zeroconf ────────────────────────────────────────────────────────────────
  // Scan so peers can reach us; publish so we appear to other peers on LAN.
  if (!bgZeroconf) {
    bgZeroconf = new ZeroconfAdapter();

    bgZeroconf.on("serviceResolved", async (service: Service) => {
      backgroundLog.info("bg › zeroconf service resolved", {
        hasId: Boolean(service?.txt?.id),
      });
      // No peer registration in background — DiscoveryService handles that
      // when the app is alive. We only log here.
    });

    bgZeroconf.startScan();
    backgroundLog.info("bg › zeroconf scan started");

    // Publish our own service so other LAN peers can discover us
    const [peerId, username, firstName, lastName] = await Promise.all([
      getStoredPeerId(),
      getStoredUsername(),
      getStoredFirstName(),
      getStoredLastName(),
    ]);
    if (peerId && username && firstName) {
      bgZeroconf.publishService({
        type: "lanchat",
        protocol: "tcp",
        domain: "local.",
        name: `Device-${Date.now()}`,
        port,
        txt: { id: peerId, username, firstName, lastName: lastName ?? "" },
      });
      backgroundLog.info("bg › zeroconf service published");
    }
  }
};

export const stopBackgroundOnlyServices = () => {
  try {
    bgTcpServer?.stop();
    bgWsAdapter?.disconnect();
    void bgZeroconf?.cleanUp();
    bgTcpServer = null;
    bgWsAdapter = null;
    bgZeroconf = null;
    bgNetworkConfig = null;
    backgroundLog.info("bg › background-only services stopped");
  } catch (error) {
    backgroundLog.error("bg › stop background services failed", { error });
  }
};

// ── Task definition ────────────────────────────────────────────────────────────

TaskManager.defineTask(SIGNALING_TASK, async () => {
  // Read from secure store — _isAppAlive is always false in this separate JS context.
  const appAlive = await getAppAlive();
  backgroundLog.info("bg › task triggered", { appAlive });

  try {
    if (appAlive) {
      // ConnectionService + DiscoveryService own all transports.
      // Stop any lingering background instances to free ports and listeners.
      stopBackgroundOnlyServices();
      backgroundLog.info("bg › app alive, handing off to MainContainer");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await startBackgroundOnlyServices();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    backgroundLog.error("bg › task failed", { error });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
