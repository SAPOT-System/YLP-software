import { consoleTransport, logger } from "react-native-logs";
import Reactotron from "reactotron-react-native";

const raw = process.env.EXPO_PUBLIC_ENABLED_LOG_MODULES ?? "";
const ENABLED_MODULES = raw ? raw.split(",").map((m: string) => m.trim()) : []; // empty = allow ALL modules

const isModuleEnabled = (module: string) => {
  if (ENABLED_MODULES.length === 0) return true;
  return ENABLED_MODULES.indexOf(module) + 1;
};

export const createScopedLogger = (scope: string) => {
  const scoped = baseLogger.extend(scope);

  // wrap methods to filter logging
  const wrap =
    (fn: (msg: string, ...args: unknown[]) => void) =>
    (msg: string, ...args: unknown[]) => {
      if (!isModuleEnabled(scope)) return;
      return fn(msg, ...args);
    };

  return {
    debug: wrap(scoped.debug),
    info: wrap(scoped.info),
    warn: wrap(scoped.warn),
    error: wrap(scoped.error),
  };
};

// Custom transport: sends to Reactotron in dev, noop in prod
const reactotronTransport = (props: ReactotronTransportProps) => {
  if (__DEV__ && Reactotron.display) {
    Reactotron.display({
      name: props.level.text.toUpperCase(),
      value: props.rawMsg,
      preview: String(props.rawMsg).slice(0, 100),
      important: props.level.severity >= 2, // warn + error
    });
  }
};

type ReactotronTransportProps = {
  level: { text: string; severity: number };
  rawMsg: unknown;
};

const baseLogger = logger.createLogger({
  severity: __DEV__ ? "debug" : "error",
  transport: __DEV__
    ? [reactotronTransport, consoleTransport]
    : [consoleTransport],
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  },
  transportOptions: {
    colors: {
      debug: "green",
      info: "blueBright",
      warn: "yellowBright",
      error: "redBright",
    },
  },
  async: true,
  dateFormat: "time",
  printDate: false,
  printLevel: true,
  enabled: true,
});

baseLogger.debug("[logger] module loaded");

export const authLog = createScopedLogger("auth");
export const apiLog = createScopedLogger("api");
export const navLog = createScopedLogger("nav");
export const uiLog = createScopedLogger("ui");

export const adapterLog = createScopedLogger("adapter");
export const appLog = createScopedLogger("app");
export const authApiLog = createScopedLogger("auth-api");
export const authComponentsLog = createScopedLogger("auth-components");
export const authHooksLog = createScopedLogger("auth-hooks");
export const authIndexLog = createScopedLogger("auth-index");
export const authTypesLog = createScopedLogger("auth-types");
export const authUtilsLog = createScopedLogger("auth-utils");
export const callLog = createScopedLogger("call");
export const chatLog = createScopedLogger("chat");
export const chatTypesLog = createScopedLogger("chat-types");
export const cleanUpLog = createScopedLogger("cleanup");
export const configLog = createScopedLogger("config");
export const connectionLog = createScopedLogger("connection");
export const contextLog = createScopedLogger("context");
export const databaseLog = createScopedLogger("database");
export const dbLog = createScopedLogger("database");
export const discoveryLog = createScopedLogger("discovery");
export const guestUserLog = createScopedLogger("guest-user");
export const healthLog = createScopedLogger("health");
export const hookLog = createScopedLogger("hook");
export const layoutLog = createScopedLogger("layout");
export const migrationLog = createScopedLogger("database");
export const modeLog = createScopedLogger("mode");
export const modelLog = createScopedLogger("database");
export const networkLog = createScopedLogger("network");
export const peerLog = createScopedLogger("peer");
export const photoLog = createScopedLogger("profile-photo");
export const repoLog = createScopedLogger("repository");
export const routesLog = createScopedLogger("routes");
export const schemaLog = createScopedLogger("database");
export const serviceLog = createScopedLogger("service");
export const sessionLog = createScopedLogger("session");
export const sharedLog = createScopedLogger("shared");
export const signalingLog = createScopedLogger("signaling");
export const storeLog = createScopedLogger("store");
export const syncLog = createScopedLogger("sync");
export const tcpLog = createScopedLogger("tcp");
export const typeLog = createScopedLogger("types");
export const userLog = createScopedLogger("user");
export const utilLog = createScopedLogger("util");
export const webrtcLog = createScopedLogger("webrtc");
export const wsLog = createScopedLogger("ws");
export const zeroconfLog = createScopedLogger("zeroconf");
export const backgroundLog = createScopedLogger("background");
export default baseLogger;
