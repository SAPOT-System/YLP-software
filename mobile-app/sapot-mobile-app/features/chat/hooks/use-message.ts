import { useCallback, useEffect, useState } from "react";
import { Message } from "@/features/shared";
import { useChatService, useMessageRepository } from "./use-container";

const useMessage = () => {
  const chatService = useChatService();
  const getMessageStatus = useCallback(async (id: string) => {
    return await chatService.getMessageStatus(id);
  }, []);
  return { getMessageStatus };
};

export default useMessage;
