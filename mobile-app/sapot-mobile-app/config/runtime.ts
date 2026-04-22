import { configLog } from "@/features/shared/utils/logger";
import * as Updates from "expo-updates";

const DEV_PORT = "8000";
const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST;
const STAGING_HOST = "sapot.online";

export const getApiUrl = () => {
  if (__DEV__) {
    configLog.debug("config › env dev");
    return `http://${DEV_HOST}:${DEV_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      configLog.debug("config › env preview", { channel });
      return `https://${STAGING_HOST}`;

    case "production":
      return `https://${STAGING_HOST}`;

    default:
      return `http://${DEV_HOST}:${DEV_PORT}`;
  }
};

const TILE_PORT = "8080";

export const getTileServerUrl = () => {
  if (__DEV__) {
    return `http://${DEV_HOST}:${TILE_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
    case "production":
      return `https://${STAGING_HOST}`;
    default:
      return `http://${DEV_HOST}:${TILE_PORT}`;
  }
};

export const getWsUrl = () => {
  if (__DEV__) {
    return `ws://${DEV_HOST}:${DEV_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return `wss://${STAGING_HOST}`;

    case "production":
      return `wss://${STAGING_HOST}`;

    default:
      return `ws://${DEV_HOST}:${DEV_PORT}`;
  }
};
