import { Q } from "@nozbe/watermelondb";
import { withObservables } from "@nozbe/watermelondb/react";
import React, { memo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

import {
    GuestUser,
    Message,
    MessageStatus,
    Peer,
    database,
    formatDate,
} from "@/features/shared";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { usePeerService } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { useChatService } from "@/features/chat/hooks/use-chat-service";
import { useTheme } from "react-native-paper";
uiLog.debug("[message-list] module loaded");

const enhanceMessages = withObservables(
  ["conversationId"],
  ({ conversationId }: { conversationId: string }) => ({
    messages: database
      .get<Message>(Message.table)
      .query(Q.where("conversation", conversationId))
      .observe(),
  })
);

const MessageList = enhanceMessages(
  ({ messages, peerId }: { messages: Message[]; peerId: string }) => {
    return (
      <View>
        <FlatList
          data={messages}
          renderItem={({ item }) => (
            <MessageListItem message={item} peerId={peerId} />
          )}
          keyExtractor={(message) => message.id}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        />
      </View>
    );
  }
);

const enhanceMessage = withObservables(
  ["message"],
  ({ message }: { message: Message }) => ({
    message,
    sender: message.sender?.observe?.(),
    status: database
      .get<MessageStatus>(MessageStatus.table)
      .query(Q.where("message", message.id))
      .observeWithColumns(["status"]),
  })
);

const getSenderName = (sender?: Peer | GuestUser | null) => {
  if (!sender) {
    return "Unknown";
  }

  const fullName = `${sender.firstName ?? ""} ${sender.lastName ?? ""}`.trim();
  return fullName || sender.username || "Unknown";
};

const MessageListItem = enhanceMessage(
  ({
    message,
    sender,
    status,
    peerId,
  }: {
    message: Message;
    sender?: Peer | GuestUser;
    status: MessageStatus[];
    peerId: string;
  }) => {
    const statusObj = status?.[0];
    const senderName = getSenderName(sender);
    const theme = useTheme();
    const chatService = useChatService();
    const peerService = usePeerService();
    const [isResending, setIsResending] = useState(false);

    const handleResend = async () => {
      const discoveredPeer = peerService.findDiscoveredPeerById(peerId);
      setIsResending(true);
      try {
        await chatService.tryResendMessage(
          message,
          peerId,
          discoveredPeer
            ? { ipAddress: discoveredPeer.ipAddress, port: discoveredPeer.port }
            : undefined
        );
      } catch (err) {
        uiLog.warn("[message-list] resend failed", { peerId, err });
      } finally {
        setIsResending(false);
      }
    };

    // For the peer message
    if (!statusObj) {
      return (
        <View
          style={{
            backgroundColor: theme.dark ? "#1A233A" : "#EAEDF3",
            alignSelf: "flex-start",
            padding: 10,
          }}
        >
          <Text
            style={{ color: theme.dark ? "#737171" : "#6A6A6A", fontSize: 14 }}
          >
            {senderName}, {formatDate(message.createdAt)}
          </Text>
          <Text
            style={{ color: theme.dark ? "#737171" : "#000000", fontSize: 17 }}
          >
            {message.content}
          </Text>
        </View>
      );
    }

    const isNotSent = statusObj.status === MessageStatusType.NOT_SENT;

    return (
      <View style={{ alignSelf: "flex-end" }}>
        <View
          style={{
            backgroundColor: "#3A7AFE",
            borderRadius: 4,
            padding: 10,
          }}
        >
          <Text style={{ color: "#DFD8D8", fontSize: 14 }}>
            You, {formatDate(message.createdAt)}
          </Text>
          <Text style={{ color: "#FFFFFF", fontSize: 17 }}>
            {message.content}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: theme.dark ? "#9C9C9C" : "" }}>
            {statusObj.status}
          </Text>
          {isNotSent && (
            <TouchableOpacity onPress={handleResend} disabled={isResending}>
              <Text
                style={{
                  color: isResending ? "#9C9C9C" : "#3A7AFE",
                  fontSize: 13,
                }}
              >
                {isResending ? "Resending..." : "Resend"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
);

export default memo(MessageList);
