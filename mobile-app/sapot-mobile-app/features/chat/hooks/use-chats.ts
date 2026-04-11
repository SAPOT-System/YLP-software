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
        hookLog.error("[useChats] load failed", { error });
      }
    };
    init();
  }, [chatService]);
  return { chats };
};

export default useChats;
