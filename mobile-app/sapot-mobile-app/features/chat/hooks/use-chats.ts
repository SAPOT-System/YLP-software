import { toAppError, captureAppError } from "@/features/shared/errors";
import { Conversation } from "@/features/shared";
import { hookLog } from "@/features/shared/utils/logger";
import { useEffect, useState } from "react";
import { useChatService } from "./use-chat-service";
hookLog.debug("[use-chats] module loaded");

const useChats = () => {
  const chatService = useChatService();
  const [chats, setChats] = useState<Conversation[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const nextChats = await chatService.getAllConversations();
        hookLog.info("[useChats] loaded", { count: nextChats.length });
        setChats(nextChats);
      } catch (error) {
        const appErr = toAppError(error, "network");
        hookLog.error("[useChats] load failed", appErr);
      }
    };
    init();
  }, [chatService]);
  return { chats };
};

export default useChats;
