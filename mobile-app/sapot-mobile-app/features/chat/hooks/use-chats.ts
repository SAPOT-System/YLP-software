import { Conversation } from "@/features/shared";
import { useChatService } from "@/features/shared/hooks";
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
