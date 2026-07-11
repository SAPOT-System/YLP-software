import { configLog } from "@/features/shared/core/utils/logger";
import * as SapotTrust from "@/modules/sapot-trust";
import * as Updates from "expo-updates";

// const PORT = "8000";
const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST;
const SERVER_NAME = "server.sapot.lan";

// In `__DEV__`, `_hostOverride` is treated as the literal hostname the app talks to
// (dev/QA pointing at an arbitrary dev machine). In field builds it is instead the
// server's IP address: it is fed to the native `Dns` via `SapotTrust.setServerAddress`
// so `SERVER_NAME` resolves to it, but the app's URLs always keep using `SERVER_NAME` —
// the raw IP never becomes the URL host, so TLS hostname verification still passes.
let _hostOverride: string | null = null;

const applyFieldHostOverride = (ip: string) => {
  SapotTrust.setServerAddress(SERVER_NAME, ip).catch((error) => {
    configLog.error("config › failed to set native server address", { error });
  });
};

export const setRuntimeHostOverride = (host: string | null) => {
  _hostOverride = host;

  if (!__DEV__ && host) {
    applyFieldHostOverride(host);
  }
};

export const initRuntimeOverrides = async () => {
  const { getServerHostOverride } = await import(
    "@/features/shared/core/stores/secure-config"
  );
  _hostOverride = await getServerHostOverride();
  configLog.info("config › host override loaded", {
    hasOverride: Boolean(_hostOverride),
  });

  if (!__DEV__ && _hostOverride) {
    try {
      await SapotTrust.setServerAddress(SERVER_NAME, _hostOverride);
    } catch (error) {
      configLog.error("config › failed to set native server address", { error });
    }
  }
};

export const getApiUrl = () => {
  if (__DEV__) {
    if (_hostOverride) return `https://${_hostOverride}`;
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

const TILE_PORT = "8080";

export const getTileServerUrl = () => {
  if (__DEV__) {
    if (_hostOverride) return `https://${_hostOverride}:${TILE_PORT}`;
    return `https://${DEV_HOST}:${TILE_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
    case "production":
      return `https://${SERVER_NAME}:${TILE_PORT}`;
    default:
      return `https://${DEV_HOST}:${TILE_PORT}`;
  }
};

export function getServerVerifyKey(): string | undefined {
  return process.env.EXPO_PUBLIC_SERVER_VERIFY_KEY;
}

export const getWsUrl = () => {
  if (__DEV__) {
    if (_hostOverride) return `wss://${_hostOverride}`;
    return `wss://${DEV_HOST}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return `wss://${SERVER_NAME}`;

    case "production":
      return `wss://${SERVER_NAME}`;

    default:
      return `wss://${DEV_HOST}`;
  }
};
