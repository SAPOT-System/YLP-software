import { Conversation } from "@/features/shared";
import { useEffect, useState } from "react";
import { useChatService } from "./use-chat-service";

const useChats = () => {
  const chatService = useChatService();
  const [chats, setChats] = useState<Conversation[]>([]);

  useEffect(() => {
    const init = async () => {
      setChats(await chatService.getAllConversations());
    };
    init();
  }, [chatService]);
  return { chats };
};

export default useChats;
