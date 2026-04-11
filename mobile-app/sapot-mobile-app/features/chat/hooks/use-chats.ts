import { Conversation } from "@/features/shared";
import { useEffect, useState } from "react";
import { useChatService } from "./use-chat-service";
import baseLogger from "@/features/shared/utils/logger";

const hookLog = baseLogger.extend("hook");
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
