import { useMainContainer } from "@/features/shared/hooks";
import { hookLog } from "@/features/shared/core/utils/logger";
hookLog.debug("[use-chat-service] module loaded");

export function useChatService() {
  return useMainContainer().chatService;
}
