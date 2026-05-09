import { hookLog } from "../utils/logger";
import { useMainContainer } from "./use-main-container";
hookLog.debug("[use-connection-service] module loaded");

export function useConnectionService() {
  return useMainContainer().connectionService;
}
