import { View, Text, FlatList, Pressable } from "react-native";
import React from "react";
import { Conversation, database } from "@/features/shared";
import { useRouter } from "expo-router";
import { withObservables } from "@nozbe/watermelondb/react";
import { ChatRoomSource } from "@/app/chat/[id]";

const enhanceChats = withObservables([], () => ({
  chats: database.get<Conversation>("conversations").query().observe(),
}));

const ChatList = enhanceChats(({ chats }: { chats: Conversation[] }) => {
  return (
    <View>
      <Text style={{ fontSize: 16 }}>Chat List</Text>
      <FlatList
        data={chats}
        renderItem={({ item }) => <ChatListItem chat={item} />}
        keyExtractor={(chat) => chat.id}
      />
    </View>
  );
});

const enhanceChat = withObservables(
  ["chat"],
  ({ chat }: { chat: Conversation }) => ({
    chat,
  })
);

const ChatListItem = enhanceChat(({ chat }: { chat: Conversation }) => {
  const router = useRouter();
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/chat/[id]",
          params: { id: chat.id, source: ChatRoomSource.CHAT },
        })
      }
      style={{
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 4,
      }}
    >
      <Text>
        {chat.id}^^^{chat.createdAt.toLocaleString()}
      </Text>
    </Pressable>
  );
});

export default ChatList;
