import { getWsUrl } from "@/config/runtime";
import { useAppMode } from "@/features/shared/context/app-mode-context";
import { useMainContainer } from "@/features/shared/hooks";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { getStoredAccessToken } from "@/features/shared/stores/secure-config";
import { hookLog } from "@/features/shared/utils/logger";
import { useCallback, useEffect, useState } from "react";
import { PublicChatMessage } from "../types";

hookLog.debug("[use-public-chat] module loaded");

export function usePublicChat() {
  const { publicChatService } = useMainContainer();
  const userStore = useUserStore();
  const { mode } = useAppMode();

  const isAvailable =
    !userStore.isGuest && (mode === "auto" || mode === "server");

  const [messages, setMessages] = useState<PublicChatMessage[]>(() =>
    publicChatService.getMessages()
  );
  const [isConnected, setIsConnected] = useState(
    () => publicChatService.isConnected
  );

  useEffect(() => {
    const unsub = publicChatService.subscribe(() => {
      setMessages(publicChatService.getMessages());
      setIsConnected(publicChatService.isConnected);
    });
    return unsub;
  }, [publicChatService]);

  useEffect(() => {
    if (!isAvailable) {
      publicChatService.disconnect();
      setIsConnected(false);
      return;
    }

    getStoredAccessToken().then((token) => {
      if (!token) {
        hookLog.warn("public-chat › no token, skipping connect");
        return;
      }
      publicChatService.connect(getWsUrl(), token);
    });
  }, [isAvailable, publicChatService]);

  const sendMessage = useCallback(
    (content: string) => {
      publicChatService.sendMessage(content);
    },
    [publicChatService]
  );

  return { messages, sendMessage, isConnected, isAvailable };
}
