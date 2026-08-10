import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import {
  consoleTransport,
  fileAsyncTransport,
  logger,
} from "react-native-logs";
import Reactotron from "reactotron-react-native";

// File logging: always on in production builds (a debugger isn't attached in
// the field), opt-in during development via EXPO_PUBLIC_LOG_TO_FILE=1.
const LOG_TO_FILE = !__DEV__ || process.env.EXPO_PUBLIC_LOG_TO_FILE === "1";

// One file per day; react-native-logs replaces {date-today} using fileNameDateType.
const LOG_FILE_NAME_TEMPLATE = "sapot-{date-today}.log";

// Resolve the on-device document directory (new expo-file-system API) without a
// trailing slash, so file paths match what fileAsyncTransport composes.
const logDirectory = (): string =>
  FileSystem.Paths.document.uri.replace(/\/$/, "");

// Mirrors fileAsyncTransport's ISO date format (non-zero-padded: YYYY-M-D).
const todaysLogFileName = (): string => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${
    today.getMonth() + 1
  }-${today.getDate()}`;
  return LOG_FILE_NAME_TEMPLATE.replace("{date-today}", iso);
};

/** Absolute URI of today's log file (the file the logger is currently writing). */
export const getLogFilePath = (): string =>
  `${logDirectory()}/${todaysLogFileName()}`;

/** Delete today's log file. No-op if it doesn't exist. */
export const clearLogFile = (): void => {
  try {
    const file = new FileSystem.File(getLogFilePath());
    if (file.exists) file.delete();
  } catch (error) {
    console.error("[logger] failed to clear log file:", error);
  }
};

// --- Dev-only: ship logs to a collector running on the developer's laptop ---
// In development the device/emulator can't write to the laptop's disk, so logs
// are POSTed to scripts/dev-log-server.mjs. On by default in dev; opt out with
// EXPO_PUBLIC_LOG_TO_LAPTOP=0. Disabled under Jest (no laptop collector there).
const LOG_TO_LAPTOP =
  __DEV__ &&
  process.env.EXPO_PUBLIC_LOG_TO_LAPTOP !== "0" &&
  process.env.JEST_WORKER_ID === undefined;

// Port the laptop log collector listens on (must match dev-log-server.js).
const LOG_SERVER_PORT = process.env.EXPO_PUBLIC_LOG_SERVER_PORT ?? "19000";

type DevServerInfo = { host: string; port: string };

/**
 * Laptop host + Metro (dev client) port, parsed from the running bundle URL.
 * The port distinguishes concurrent dev clients so their logs go to separate
 * files. Returns null outside a dev bundle (e.g. production or tests).
 */
export const getDevServerInfo = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  const [host, port] = hostUri.split(":");

  return {
    host,
    port: port ?? "8081",
  };
};

const LAPTOP_FLUSH_MS = 1000;
const LAPTOP_MAX_BUFFER = 100;
let cachedDevServerInfo: DevServerInfo | null | undefined;
let laptopLogBuffer: string[] = [];
let laptopFlushTimer: ReturnType<typeof setTimeout> | null = null;

const resolveDevServerInfo = (): DevServerInfo | null => {
  if (cachedDevServerInfo === undefined)
    cachedDevServerInfo = getDevServerInfo();
  return cachedDevServerInfo;
};

const flushLaptopLogs = (): void => {
  laptopFlushTimer = null;
  if (laptopLogBuffer.length === 0) return;

  const info = resolveDevServerInfo();
  if (!info || typeof fetch !== "function") {
    laptopLogBuffer = [];
    return;
  }

  const body = laptopLogBuffer.join("");
  laptopLogBuffer = [];

  // File is separated per dev client (Metro) port on the laptop side.
  fetch(`http://${info.host}:${LOG_SERVER_PORT}/log?port=${info.port}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  }).catch(() => {
    // Best-effort: the laptop log server may not be running.
  });
};

// react-native-logs transport: buffers lines and flushes them to the laptop.
const laptopLogTransport = (props: { msg: unknown }): void => {
  if (!resolveDevServerInfo()) return;

  laptopLogBuffer.push(`${props.msg}\n`);

  if (laptopLogBuffer.length >= LAPTOP_MAX_BUFFER) {
    if (laptopFlushTimer) clearTimeout(laptopFlushTimer);
    flushLaptopLogs();
    return;
  }
  if (!laptopFlushTimer) {
    laptopFlushTimer = setTimeout(flushLaptopLogs, LAPTOP_FLUSH_MS);
  }
};

const raw = process.env.EXPO_PUBLIC_ENABLED_LOG_MODULES ?? "";
const ENABLED_MODULES = raw ? raw.split(",").map((m: string) => m.trim()) : []; // empty = allow ALL modules

const isModuleEnabled = (module: string) => {
  if (ENABLED_MODULES.length === 0) return true;
  return ENABLED_MODULES.indexOf(module) + 1;
};

const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

const isValidLogLevel = (value: string): value is LogLevel =>
  (VALID_LOG_LEVELS as readonly string[]).includes(value);

// Env-driven severity floor (EXPO_PUBLIC_LOG_LEVEL), mirroring the module
// filter's env-driven pattern. Falls back to the default (debug in dev, error
// in prod) with a single warning on an unrecognised value, rather than
// silently disabling logging.
const resolveLogLevel = (): LogLevel => {
  const envLevel = process.env.EXPO_PUBLIC_LOG_LEVEL;
  const defaultLevel: LogLevel = __DEV__ ? "debug" : "error";
  if (!envLevel) return defaultLevel;
  if (isValidLogLevel(envLevel)) return envLevel;

  console.warn(
    `[logger] invalid EXPO_PUBLIC_LOG_LEVEL "${envLevel}", falling back to "${defaultLevel}"`,
  );
  return defaultLevel;
};

const LOG_LEVEL = resolveLogLevel();

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
  severity: LOG_LEVEL,
  transport: [
    ...(__DEV__
      ? [
          reactotronTransport,
          consoleTransport,
          ...(LOG_TO_LAPTOP ? [laptopLogTransport] : []),
        ]
      : [consoleTransport]),
    ...(LOG_TO_FILE ? [fileAsyncTransport] : []),
  ],
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
    // Consumed by fileAsyncTransport (ignored by the other transports). Always
    // provided so the options type stays well-formed; only takes effect when
    // fileAsyncTransport is actually in the transport list (LOG_TO_FILE).
    FS: FileSystem,
    fileName: LOG_FILE_NAME_TEMPLATE,
    fileNameDateType: "iso" as const,
    filePath: logDirectory(),
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
export const gpsLog = createScopedLogger("gps");
export default baseLogger;
