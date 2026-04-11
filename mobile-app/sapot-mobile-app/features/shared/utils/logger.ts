import { consoleTransport, logger } from "react-native-logs";
import Reactotron from "reactotron-react-native";
import { LOG_MODULES } from "./logger.config";

const isModuleEnabled = (module: string) => {
  if (LOG_MODULES[module] === undefined) return true; // default ON
  return LOG_MODULES[module];
};

const createScopedLogger = (scope: string) => {
  const scoped = baseLogger.extend(scope);

  // wrap methods to filter logging
  const wrap =
    (fn: any) =>
    (msg: string, ...args: any[]) => {
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
export default baseLogger;
