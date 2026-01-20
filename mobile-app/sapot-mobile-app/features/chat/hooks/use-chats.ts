import { useEffect, useState } from "react";
import { Conversation } from "@/features/shared";
import { useChatService } from "./use-container";

const useChats = () => {
  const chatService = useChatService();
  const [chats, setChats] = useState<Conversation[]>([]);

  useEffect(() => {
    const init = async () => {
      setChats(await chatService.getAllPeers());
    };
    init();
  }, []);
  return { chats };
};

export default useChats;
