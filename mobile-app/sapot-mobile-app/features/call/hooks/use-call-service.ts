import { useMainContainer } from "@/features/shared/hooks";
import { hookLog } from "@/features/shared/utils/logger";
hookLog.debug("[use-call-service] module loaded");

export function useCallService() {
  return useMainContainer().callService;
}
