import { hookLog } from "../core/utils/logger";
import { useMainContainer } from "./use-main-container";
hookLog.debug("[use-connection-service] module loaded");

export function useAcitveUserService() {
  return useMainContainer().activeUsersService;
}
