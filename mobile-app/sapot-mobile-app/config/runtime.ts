import { configLog } from "@/features/shared/core/utils/logger";
import * as Updates from "expo-updates";

// const PORT = "8000";
const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST;
const SERVER_NAME = "server.sapot.lan";

let _hostOverride: string | null = null;

export const setRuntimeHostOverride = (host: string | null) => {
  _hostOverride = host;
};

export const initRuntimeOverrides = async () => {
  const { getServerHostOverride } = await import(
    "@/features/shared/core/stores/secure-config"
  );
  _hostOverride = await getServerHostOverride();
  configLog.info("config › host override loaded", {
    hasOverride: Boolean(_hostOverride),
  });
};

export const getApiUrl = () => {
  if (_hostOverride) return `https://${_hostOverride}`;

  if (__DEV__) {
    configLog.debug("config › env dev");
    return `https://${DEV_HOST}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      configLog.debug("config › env preview", { channel });
      return `https://${SERVER_NAME}`;

    case "production":
      return `https://${SERVER_NAME}`;

    default:
      return `https://${DEV_HOST}`;
  }
};

export const getTileServerUrl = () => {
  if (_hostOverride) return `https://${_hostOverride}/tiles`;

  if (__DEV__) {
    return `https://${DEV_HOST}/tiles`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
    case "production":
      return `https://${SERVER_NAME}/tiles`;
    default:
      return `https://${DEV_HOST}/tiles`;
  }
};

export function getServerVerifyKey(): string | undefined {
  return process.env.EXPO_PUBLIC_SERVER_VERIFY_KEY;
}

export const normalizeWebSocketUrl = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let normalized: string;

  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) {
    normalized = trimmed;
  } else if (trimmed.startsWith("https://")) {
    normalized = `wss://${trimmed.slice("https://".length)}`;
  } else if (trimmed.startsWith("http://")) {
    normalized = `ws://${trimmed.slice("http://".length)}`;
  } else {
    normalized = `wss://${trimmed}`;
  }

  if (!__DEV__ && normalized.startsWith("ws://")) {
    throw new Error("Plaintext WebSocket URLs are only allowed in development");
  }

  return normalized;
};

export const getWsUrl = () => {
  if (_hostOverride) return normalizeWebSocketUrl(_hostOverride);

  if (__DEV__) {
    return normalizeWebSocketUrl(DEV_HOST ?? "");
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return normalizeWebSocketUrl(SERVER_NAME);

    case "production":
      return normalizeWebSocketUrl(SERVER_NAME);

    default:
      return normalizeWebSocketUrl(DEV_HOST ?? "");
  }
};
