import { hookLog } from "../utils/logger";
import { useMainContainer } from "./use-main-container";
hookLog.debug("[use-sync-service] module loaded");

export function useSyncService() {
  return useMainContainer().syncService;
}
