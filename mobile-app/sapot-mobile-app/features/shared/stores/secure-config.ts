import { deleteItemAsync, setItemAsync, getItemAsync } from "expo-secure-store";
import { backgroundLog } from "../utils/logger";

// ── Keys ───────────────────────────────────────────────────────────────────────

const KEYS = {
  PEER_ID: "peerId",
  WS_URL: "wsUrl",
  TCP_HOST: "tcpHost",
  TCP_PORT: "tcpPort",
  LOCAL_IP: "localIp",
  ACCESS_TOKEN: "access_token",
  APP_ALIVE: "appAlive",
} as const;

// ── Writers ────────────────────────────────────────────────────────────────────

export const saveConnectionConfig = async (config: {
  peerId: string;
  wsUrl?: string;
  tcpHost?: string;
  tcpPort?: number;
  localIp?: string;
}) => {
  try {
    await setItemAsync(KEYS.PEER_ID, config.peerId);

    if (config.wsUrl) {
      await setItemAsync(KEYS.WS_URL, config.wsUrl);
    }
    if (config.tcpHost) {
      await setItemAsync(KEYS.TCP_HOST, config.tcpHost);
    }
    if (config.tcpPort) {
      await setItemAsync(KEYS.TCP_PORT, String(config.tcpPort));
    }
    if (config.localIp) {
      await setItemAsync(KEYS.LOCAL_IP, config.localIp);
    }

    backgroundLog.info("secure-config › saved");
  } catch (error) {
    backgroundLog.error("secure-config › save failed", { error });
    throw error;
  }
};

// Individual updaters called by NetworkConfig on IP/port change

export const saveLocalIp = async (ip: string) => {
  try {
    await setItemAsync(KEYS.LOCAL_IP, ip);
    backgroundLog.info("secure-config › local ip updated");
  } catch (error) {
    backgroundLog.error("secure-config › local ip save failed", { error });
  }
};

export const saveLocalPort = async (port: number) => {
  try {
    await setItemAsync(KEYS.TCP_PORT, String(port));
    backgroundLog.info("secure-config › local port updated");
  } catch (error) {
    backgroundLog.error("secure-config › local port save failed", { error });
  }
};

// ── Readers ────────────────────────────────────────────────────────────────────

export const getStoredPeerId = async (): Promise<string> => {
  try {
    return (await getItemAsync(KEYS.PEER_ID)) ?? "unknown";
  } catch (error) {
    backgroundLog.error("secure-config › read peerId failed", { error });
    return "unknown";
  }
};

export const getStoredWsUrl = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.WS_URL)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read wsUrl failed", { error });
    return undefined;
  }
};

export const getStoredTcpHost = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.TCP_HOST)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read tcpHost failed", { error });
    return undefined;
  }
};

export const getStoredTcpPort = async (): Promise<number | undefined> => {
  try {
    const val = await getItemAsync(KEYS.TCP_PORT);
    return val ? parseInt(val, 10) : undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read tcpPort failed", { error });
    return undefined;
  }
};

export const getStoredLocalIp = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.LOCAL_IP)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read localIp failed", { error });
    return undefined;
  }
};

export const getStoredAccessToken = async () => {
  try {
    return (await getItemAsync(KEYS.ACCESS_TOKEN)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read access token failed", { error });
    return undefined;
  }
};

export const saveAppAlive = async (alive: boolean) => {
  try {
    await setItemAsync(KEYS.APP_ALIVE, alive ? "1" : "0");
  } catch (error) {
    backgroundLog.error("secure-config › save appAlive failed", { error });
  }
};

export const getAppAlive = async (): Promise<boolean> => {
  try {
    const val = await getItemAsync(KEYS.APP_ALIVE);
    return val === "1";
  } catch (error) {
    backgroundLog.error("secure-config › read appAlive failed", { error });
    return false;
  }
};

// ── Cleanup (on logout) ────────────────────────────────────────────────────────

export const clearConnectionConfig = async () => {
  try {
    await Promise.all(Object.values(KEYS).map((key) => deleteItemAsync(key)));
    backgroundLog.info("secure-config › cleared");
  } catch (error) {
    backgroundLog.error("secure-config › clear failed", { error });
    throw error;
  }
};
