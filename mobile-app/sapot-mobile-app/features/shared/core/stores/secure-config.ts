import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import { backgroundLog } from "../utils/logger";
import type { AppMode } from "./app-mode-store";

// ── Keys ───────────────────────────────────────────────────────────────────────

const KEYS = {
  PEER_ID: "peerId",
  WS_URL: "wsUrl",
  TCP_HOST: "tcpHost",
  TCP_PORT: "tcpPort",
  LOCAL_IP: "localIp",
  ACCESS_TOKEN: "access_token",
  APP_ALIVE: "appAlive",
  USERNAME: "username",
  FIRST_NAME: "firstName",
  LAST_NAME: "lastName",
  SYNC_LAST_PULLED_AT: "syncLastPulledAt",
  SERVER_HOST_OVERRIDE: "serverHostOverride",
  APP_MODE: "appMode",
  DEVICE_ENCRYPTION_KEY: "deviceEncryptionKey",
  MASTER_KEY: "masterKey",
  SIGNALING_SECRET_KEY: "signalingSecretKey",
  RECOVERY_TOKEN_HEX: "recoveryTokenHex",
  MIGRATION_STATE: "guestMigrationState",
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

export const saveAccessToken = async (token: string): Promise<void> => {
  try {
    await setItemAsync(KEYS.ACCESS_TOKEN, token);
    backgroundLog.info("secure-config › access token saved");
  } catch (error) {
    backgroundLog.error("secure-config › access token save failed", { error });
    throw error;
  }
};

export const clearAccessToken = async (): Promise<void> => {
  try {
    await deleteItemAsync(KEYS.ACCESS_TOKEN);
    backgroundLog.info("secure-config › access token cleared");
  } catch (error) {
    backgroundLog.error("secure-config › access token clear failed", { error });
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

export const saveUserProfile = async (profile: {
  username: string;
  firstName: string;
  lastName?: string;
}) => {
  try {
    await setItemAsync(KEYS.USERNAME, profile.username);
    await setItemAsync(KEYS.FIRST_NAME, profile.firstName);
    if (profile.lastName) {
      await setItemAsync(KEYS.LAST_NAME, profile.lastName);
    }
    backgroundLog.info("secure-config › user profile saved");
  } catch (error) {
    backgroundLog.error("secure-config › user profile save failed", { error });
  }
};

export const getStoredUsername = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.USERNAME)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read username failed", { error });
    return undefined;
  }
};

export const getStoredFirstName = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.FIRST_NAME)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read firstName failed", { error });
    return undefined;
  }
};

export const getStoredLastName = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.LAST_NAME)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › read lastName failed", { error });
    return undefined;
  }
};

export const saveServerHostOverride = async (host: string | null) => {
  try {
    if (host) {
      await setItemAsync(KEYS.SERVER_HOST_OVERRIDE, host);
    } else {
      await deleteItemAsync(KEYS.SERVER_HOST_OVERRIDE);
    }
    backgroundLog.info("secure-config › server host override saved");
  } catch (error) {
    backgroundLog.error("secure-config › server host override save failed", { error });
  }
};

export const getServerHostOverride = async (): Promise<string | null> => {
  try {
    return (await getItemAsync(KEYS.SERVER_HOST_OVERRIDE)) ?? null;
  } catch (error) {
    backgroundLog.error("secure-config › server host override read failed", { error });
    return null;
  }
};

export const saveSyncLastPulledAt = async (timestamp: number) => {
  try {
    await setItemAsync(KEYS.SYNC_LAST_PULLED_AT, String(timestamp));
  } catch (error) {
    backgroundLog.error("secure-config › sync timestamp save failed", { error });
  }
};

export const saveAppMode = async (mode: AppMode) => {
  try {
    await setItemAsync(KEYS.APP_MODE, mode);
    backgroundLog.info("secure-config › app mode saved", { mode });
  } catch (error) {
    backgroundLog.error("secure-config › app mode save failed", { error, mode });
  }
};

export const getStoredAppMode = async (): Promise<AppMode | null> => {
  try {
    const value = await getItemAsync(KEYS.APP_MODE);

    if (value === "auto" || value === "server" || value === "lan") {
      return value;
    }

    return null;
  } catch (error) {
    backgroundLog.error("secure-config › read app mode failed", { error });
    return null;
  }
};

export const getSyncLastPulledAt = async (): Promise<number> => {
  try {
    const val = await getItemAsync(KEYS.SYNC_LAST_PULLED_AT);
    if (!val) return 0;
    const parsed = Number(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch (error) {
    backgroundLog.error("secure-config › sync timestamp read failed", { error });
    return 0;
  }
};

export const getDeviceEncryptionKey = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.DEVICE_ENCRYPTION_KEY)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › device key read failed", { error });
    return undefined;
  }
};

export const saveDeviceEncryptionKey = async (key: string): Promise<void> => {
  try {
    await setItemAsync(KEYS.DEVICE_ENCRYPTION_KEY, key);
  } catch (error) {
    backgroundLog.error("secure-config › device key write failed", { error });
    throw error;
  }
};

export const saveSignalingSecretKey = async (key: string): Promise<void> => {
  try {
    await setItemAsync(KEYS.SIGNALING_SECRET_KEY, key);
  } catch (error) {
    backgroundLog.error("secure-config › signaling secret key write failed", { error });
    throw error;
  }
};

export const getSignalingSecretKey = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.SIGNALING_SECRET_KEY)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › signaling secret key read failed", { error });
    return undefined;
  }
};

export const saveMasterKey = async (key: string): Promise<void> => {
  try {
    await setItemAsync(KEYS.MASTER_KEY, key);
  } catch (error) {
    backgroundLog.error("secure-config › master key write failed", { error });
    throw error;
  }
};

export const getMasterKey = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.MASTER_KEY)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › master key read failed", { error });
    return undefined;
  }
};

export const saveRecoveryTokenHex = async (hex: string): Promise<void> => {
  try {
    await setItemAsync(KEYS.RECOVERY_TOKEN_HEX, hex);
  } catch (error) {
    backgroundLog.error("secure-config › recovery token hex write failed", { error });
    throw error;
  }
};

export const getRecoveryTokenHex = async (): Promise<string | undefined> => {
  try {
    return (await getItemAsync(KEYS.RECOVERY_TOKEN_HEX)) ?? undefined;
  } catch (error) {
    backgroundLog.error("secure-config › recovery token hex read failed", { error });
    return undefined;
  }
};

export const setMigrationState = async (state: "in_progress"): Promise<void> => {
  try {
    await setItemAsync(KEYS.MIGRATION_STATE, state);
  } catch (error) {
    backgroundLog.error("secure-config › migration state write failed", { error });
    throw error;
  }
};

export const getMigrationState = async (): Promise<"in_progress" | null> => {
  try {
    const val = await getItemAsync(KEYS.MIGRATION_STATE);
    if (val === "in_progress") return val;
    return null;
  } catch (error) {
    backgroundLog.error("secure-config › migration state read failed", { error });
    return null;
  }
};

export const clearMigrationState = async (): Promise<void> => {
  try {
    await deleteItemAsync(KEYS.MIGRATION_STATE);
  } catch (error) {
    backgroundLog.error("secure-config › migration state clear failed", { error });
  }
};

// ── Lockout helpers ───────────────────────────────────────────────────────────

export interface LockoutInfo {
  lockedUntil: string;
  deviceType: string;
  attemptsRemaining: number;
}

const LOCKOUT_KEYS = [
  "lockout_login",
  "lockout_recovery_question",
  "lockout_recovery_key",
  "lockout_recovery_phone",
  "lockout_recovery_email",
] as const;

export type LockoutKey = (typeof LOCKOUT_KEYS)[number];

export const saveLockoutInfo = async (
  key: LockoutKey,
  lockedUntil: string,
  deviceType: string,
  attemptsRemaining: number
): Promise<void> => {
  try {
    const info: LockoutInfo = { lockedUntil, deviceType, attemptsRemaining };
    await setItemAsync(key, JSON.stringify(info));
  } catch (error) {
    backgroundLog.error("secure-config › lockout save failed", { error });
  }
};

export const getLockoutInfo = async (key: LockoutKey): Promise<LockoutInfo | null> => {
  try {
    const raw = await getItemAsync(key);
    if (!raw) return null;
    return JSON.parse(raw) as LockoutInfo;
  } catch (error) {
    backgroundLog.error("secure-config › lockout read failed", { error });
    return null;
  }
};

export const clearLockoutInfo = async (key: LockoutKey): Promise<void> => {
  try {
    await deleteItemAsync(key);
  } catch (error) {
    backgroundLog.error("secure-config › lockout clear failed", { error });
  }
};

export const clearAllLockouts = async (): Promise<void> => {
  try {
    await Promise.all(LOCKOUT_KEYS.map((key) => deleteItemAsync(key)));
  } catch (error) {
    backgroundLog.error("secure-config › clear all lockouts failed", { error });
  }
};

// ── Cleanup (on logout) ────────────────────────────────────────────────────────

export const clearConnectionConfig = async () => {
  try {
    await Promise.all(
      Object.values(KEYS).map((key) => {
        if (
          key !== KEYS.APP_MODE &&
          key !== KEYS.SERVER_HOST_OVERRIDE &&
          key !== KEYS.MIGRATION_STATE
        ) {
          return deleteItemAsync(key);
        }
        return Promise.resolve();
      })
    );
    backgroundLog.info("secure-config › cleared");
  } catch (error) {
    backgroundLog.error("secure-config › clear failed", { error });
    throw error;
  }
};
