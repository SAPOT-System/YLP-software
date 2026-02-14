import { useContainer } from "@/features/shared/hooks";

export function useChatService() {
  return useContainer().chatService;
}
