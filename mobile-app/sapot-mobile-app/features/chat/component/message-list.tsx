import { View, Text, FlatList } from "react-native";
import React, { memo } from "react";
import { withObservables } from "@nozbe/watermelondb/react";
import { Q } from "@nozbe/watermelondb";

import { Message, MessageStatus, database } from "@/features/shared";

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
      <Text style={{ fontSize: 16 }}>Message List</Text>
      <FlatList
        data={messages}
        renderItem={({ item }) => <MessageListItem message={item} />}
        keyExtractor={(message) => message.id}
      />
    </View>
  );
});

const enhanceMessage = withObservables(
  ["message"],
  ({ message }: { message: Message }) => ({
    message,
    status: database
      .get<MessageStatus>(MessageStatus.table)
      .query(Q.where("message", message.id))
      .observeWithColumns(["status"]),
  })
);

const MessageListItem = enhanceMessage(
  ({ message, status }: { message: Message; status: MessageStatus[] }) => {
    // console.log("[MessageListItem] messageId:", message.id);
    // console.log("[MessageListItem] status rows:", status.length);
    const statusObj = status?.[0];

    // For the peer message that don't need messgae status
    if (!statusObj) {
      return (
        <Text>
          Message: {message.content}, SentAt:{" "}
          {message.createdAt.toLocaleString()}
        </Text>
      );
    }
    return (
      <Text>
        Message: {message.content}, SentAt: {message.createdAt.toLocaleString()}
        , Status: {statusObj.status}
      </Text>
    );
  }
);

export default memo(MessageList);
