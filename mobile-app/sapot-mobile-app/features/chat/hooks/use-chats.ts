import { useEffect, useState } from "react";
import { Chat } from "@/features/shared";
import { useChatService } from "./use-container";

const useChats = () => {
  const chatService = useChatService();
  const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {
    const init = async () => {
      setChats(await chatService.getAllPeers());
    };
    init();
  }, []);
  return { chats };
};

export default useChats;
