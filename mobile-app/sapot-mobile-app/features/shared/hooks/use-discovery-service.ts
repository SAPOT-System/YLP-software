import baseLogger from "../utils/logger";
import { useMainContainer } from "./use-main-container";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-discovery-service] module loaded");

export function useDiscoveryService() {
  return useMainContainer().discoveryService;
}
