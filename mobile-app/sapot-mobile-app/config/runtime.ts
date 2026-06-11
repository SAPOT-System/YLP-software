import { configLog } from "@/features/shared/utils/logger";
import * as Updates from "expo-updates";

// const PORT = "8000";
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
  if (_hostOverride) return `https://${_hostOverride}`;

  if (__DEV__) {
    configLog.debug("config › env dev");
    return `https://${DEV_HOST}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      configLog.debug("config › env preview", { channel });
      return `https://${STAGING_HOST}`;

    case "production":
      return `https://${STAGING_HOST}`;

    default:
      return `https://${DEV_HOST}`;
  }
};

const TILE_PORT = "8080";

export const getTileServerUrl = () => {
  if (_hostOverride) return `https://${_hostOverride}:${TILE_PORT}`;

  if (__DEV__) {
    return `https://${DEV_HOST}:${TILE_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
    case "production":
      return `https://${STAGING_HOST}:${TILE_PORT}`;
    default:
      return `https://${DEV_HOST}:${TILE_PORT}`;
  }
};

export function getServerVerifyKey(): string | undefined {
  return process.env.EXPO_PUBLIC_SERVER_VERIFY_KEY;
}

export const getWsUrl = () => {
  if (_hostOverride) return `wss://${_hostOverride}`;

  if (__DEV__) {
    return `wss://${DEV_HOST}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return `wss://${STAGING_HOST}`;

    case "production":
      return `wss://${STAGING_HOST}`;

    default:
      return `wss://${DEV_HOST}`;
  }
};
