import { consoleTransport, logger } from "react-native-logs";
import Reactotron from "reactotron-react-native";

type ReactotronTransportProps = {
  level: { text: string; severity: number };
  rawMsg: unknown;
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

export const authLog = baseLogger.extend("auth");
export const apiLog = baseLogger.extend("api");
export const navLog = baseLogger.extend("nav");
export const uiLog = baseLogger.extend("ui");
export default baseLogger;
