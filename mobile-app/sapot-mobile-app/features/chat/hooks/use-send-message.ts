import { useCallback } from "react";
import { sendSmsToUser } from "@/features/shared/api/gsm.api";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { uiLog } from "@/features/shared/utils/logger";
import { ChatService } from "@/features/chat/services/chat-service";

type Params = {
  message: string;
  setMessage: (v: string) => void;
  conversationId: string | undefined;
  setConversationId: (id: string) => void;
  chatService: ChatService;
  isSmsMode: boolean;
  isSmsConversation: boolean;
  peerId: string | undefined;
  showError: (msg: string) => void;
};

export function useSendMessage({
  message,
  setMessage,
  conversationId,
  setConversationId,
  chatService,
  isSmsMode,
  isSmsConversation,
  peerId,
  showError,
}: Params): () => void {
  return useCallback(() => {
    const textToSend = message.trim();
    if (!textToSend) return;

    if (!chatService.hasPeer()) {
      showError("Not connected to peer");
      return;
    }

    setMessage("");

    if ((isSmsMode || isSmsConversation) && peerId) {
      void chatService
        .sendSmsChannelMessage(textToSend)
        .then(({ messageId: smsMessageId }) => {
          sendSmsToUser(peerId, textToSend)
            .then((res) => {
              const status = res.ok
                ? MessageStatusType.DELIVERED
                : MessageStatusType.NOT_SENT;
              chatService.updateMessageStatus(smsMessageId, status).catch((error) => uiLog.warn("use-send-message › SMS status update failed", { error }));
              if (!res.ok) showError("SMS could not be delivered");
            })
            .catch(() => {
              chatService
                .updateMessageStatus(smsMessageId, MessageStatusType.NOT_SENT)
                .catch((error) => uiLog.warn("use-send-message › SMS not_sent status update failed", { error }));
              showError("Message sent, but SMS delivery failed.");
            });
        })
        .catch((error) => {
          uiLog.error("chat › SMS channel message failed", {
            conversationId,
            error,
          });
          showError("Failed to record SMS message");
        });
    } else {
      void chatService
        .sendChatMessage(textToSend)
        .then(({ conversationId: chatId }) => {
          if (!conversationId && chatId) setConversationId(chatId);
        })
        .catch((error) => {
          uiLog.error("chat › send message failed", { conversationId, error });
          showError("Failed to send message");
        });
    }
  }, [
    message,
    setMessage,
    conversationId,
    setConversationId,
    chatService,
    isSmsMode,
    isSmsConversation,
    peerId,
    showError,
  ]);
}
