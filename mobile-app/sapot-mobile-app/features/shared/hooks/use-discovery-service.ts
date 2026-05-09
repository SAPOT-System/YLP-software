import { hookLog } from "../utils/logger";
import { useMainContainer } from "./use-main-container";
hookLog.debug("[use-discovery-service] module loaded");

export function useDiscoveryService() {
  return useMainContainer().discoveryService;
}
