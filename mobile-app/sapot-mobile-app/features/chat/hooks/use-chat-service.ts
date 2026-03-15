import { useMainContainer } from "@/features/shared/hooks";

export function useChatService() {
  return useMainContainer().chatService;
}
