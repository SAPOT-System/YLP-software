import { configLog } from "@/features/shared/utils/logger";
import * as Updates from "expo-updates";

const PORT = "8000";
const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST;
const STAGING_HOST = "192.168.0.100";

let _hostOverride: string | null = null;

export const setRuntimeHostOverride = (host: string | null) => {
  _hostOverride = host;
};

export const initRuntimeOverrides = async () => {
  const { getServerHostOverride } = await import(
    "@/features/shared/stores/secure-config"
  );
  _hostOverride = await getServerHostOverride();
  configLog.info("config › host override loaded", {
    hasOverride: Boolean(_hostOverride),
  });
};

export const getApiUrl = () => {
  if (_hostOverride) return `http://${_hostOverride}:${PORT}`;

  if (__DEV__) {
    configLog.debug("config › env dev");
    return `http://${DEV_HOST}:${PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      configLog.debug("config › env preview", { channel });
      return `http://${STAGING_HOST}:${PORT}`;

    case "production":
      return `http://${STAGING_HOST}:${PORT}`;

    default:
      return `http://${DEV_HOST}:${PORT}`;
  }
};

const TILE_PORT = "8080";

export const getTileServerUrl = () => {
  if (_hostOverride) return `http://${_hostOverride}:${TILE_PORT}`;

  if (__DEV__) {
    return `http://${DEV_HOST}:${TILE_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
    case "production":
      return `http://${STAGING_HOST}:${TILE_PORT}`;
    default:
      return `http://${DEV_HOST}:${TILE_PORT}`;
  }
};

export function getServerVerifyKey(): string | undefined {
  return process.env.EXPO_PUBLIC_SERVER_VERIFY_KEY;
}

export const getWsUrl = () => {
  if (_hostOverride) return `ws://${_hostOverride}:${PORT}`;

  if (__DEV__) {
    return `ws://${DEV_HOST}:${PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return `ws://${STAGING_HOST}:${PORT}`;

    case "production":
      return `ws://${STAGING_HOST}:${PORT}`;

    default:
      return `ws://${DEV_HOST}:${PORT}`;
  }
};
