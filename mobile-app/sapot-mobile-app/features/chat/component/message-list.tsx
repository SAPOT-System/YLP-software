import { View, Text, FlatList } from "react-native";
import React, { useEffect, useState } from "react";
import { Message, MessageStatus, database } from "@/features/shared";
import { withObservables } from "@nozbe/watermelondb/react";
import useMessage from "../hooks/use-message";

const enhanceMessages = withObservables([], () => ({
  messages: database.get<Message>(Message.table).query().observe(),
}));

const MessageList = enhanceMessages(({ messages }: { messages: Message[] }) => {
  return (
    <View>
      <Text style={{ fontSize: 16 }}>Chat List</Text>
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
  })
);

const MessageListItem = enhanceMessage(({ message }: { message: Message }) => {
  const { getMessageStatus } = useMessage();
  const [status, setStatus] = useState<MessageStatus | undefined>();

  useEffect(() => {
    getMessageStatus(message.id).then((s) => setStatus(s));
  }, [message.id]);

  return (
    <Text>
      Message: {message.content}, SentAt: {message.createdAt.toLocaleString()},
      Status: {status?.status}
    </Text>
  );
});

export default MessageList;
