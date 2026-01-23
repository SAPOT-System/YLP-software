import { Conversation, useChatService } from "@/features/shared";
import { useEffect, useState } from "react";

const useChats = () => {
  const chatService = useChatService();
  const [chats, setChats] = useState<Conversation[]>([]);

  useEffect(() => {
    const init = async () => {
      setChats(await chatService.getAllConversations());
    };
    init();
  }, []);
  return { chats };
};

export default useChats;
