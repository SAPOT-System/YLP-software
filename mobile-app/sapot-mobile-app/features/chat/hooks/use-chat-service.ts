import { useMainContainer } from "@/features/shared/hooks";
import { hookLog } from "@/features/shared/utils/logger";
hookLog.debug("[use-chat-service] module loaded");

export function useChatService() {
  return useMainContainer().chatService;
}
