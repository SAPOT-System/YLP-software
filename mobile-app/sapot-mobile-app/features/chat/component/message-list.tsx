import { Q } from "@nozbe/watermelondb";
import { withObservables } from "@nozbe/watermelondb/react";
import React, { memo } from "react";
import { FlatList, Text, View } from "react-native";

import {
  GuestUser,
  Message,
  MessageStatus,
  Peer,
  database,
  formatDate,
} from "@/features/shared";
import { useTheme } from "react-native-paper";

const enhanceMessages = withObservables(
  ["conversationId"],
  ({ conversationId }: { conversationId: string }) => ({
    messages: database
      .get<Message>(Message.table)
      .query(Q.where("conversation", conversationId))
      .observe(),
  })
);

const MessageList = enhanceMessages(({ messages }: { messages: Message[] }) => {
  return (
    <View>
      <FlatList
        data={messages}
        renderItem={({ item }) => <MessageListItem message={item} />}
        keyExtractor={(message) => message.id}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
      />
    </View>
  );
});

const enhanceMessage = withObservables(
  ["message"],
  ({ message }: { message: Message }) => ({
    message,
    sender: message.sender.observe(),
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
  }: {
    message: Message;
    sender: Peer | GuestUser;
    status: MessageStatus[];
  }) => {
    // console.log("[MessageListItem] messageId:", message.id);
    // console.log("[MessageListItem] status rows:", status.length);
    const statusObj = status?.[0];
    const senderName = getSenderName(sender);
    const theme = useTheme();

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
        <Text style={{ color: theme.dark ? "#9C9C9C" : "" }}>
          {statusObj.status}
        </Text>
      </View>
    );
  }
);

export default memo(MessageList);
