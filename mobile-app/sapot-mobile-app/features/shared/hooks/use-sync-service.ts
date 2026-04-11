import baseLogger from "../utils/logger";
import { useMainContainer } from "./use-main-container";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-sync-service] module loaded");

export function useSyncService() {
  return useMainContainer().syncService;
}
