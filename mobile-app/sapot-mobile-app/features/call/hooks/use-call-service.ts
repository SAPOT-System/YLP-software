import { useMainContainer } from "@/features/shared/hooks";
import baseLogger from "@/features/shared/utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-call-service] module loaded");

export function useCallService() {
  return useMainContainer().callService;
}
