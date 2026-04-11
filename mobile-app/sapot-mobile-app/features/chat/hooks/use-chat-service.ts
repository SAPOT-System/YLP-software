import { useMainContainer } from "@/features/shared/hooks";
import baseLogger from "@/features/shared/utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-chat-service] module loaded");

export function useChatService() {
  return useMainContainer().chatService;
}
