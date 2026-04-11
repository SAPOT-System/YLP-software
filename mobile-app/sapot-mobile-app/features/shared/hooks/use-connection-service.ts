import baseLogger from "../utils/logger";
import { useMainContainer } from "./use-main-container";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-connection-service] module loaded");

export function useConnectionService() {
  return useMainContainer().connectionService;
}
