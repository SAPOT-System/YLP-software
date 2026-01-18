import { View, Text, FlatList, Pressable } from "react-native";
import React from "react";
import { Chat } from "@/features/shared";
import { useRouter } from "expo-router";
import { withObservables } from "@nozbe/watermelondb/react";

const ChatList = ({ chats }: { chats: Chat[] }) => {
  return (
    <View>
      <FlatList
        data={chats}
        renderItem={({ item }) => <EnhancedChatListItem chat={item} />}
        keyExtractor={(chat) => chat.id}
      />
    </View>
  );
};

const ChatListItem = ({ chat }: { chat: Chat }) => {
  const router = useRouter();
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/chat/[id]", params: { id: chat.id } })
      }
      style={{
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 4,
      }}
    >
      <Text>
        {chat.id}^^^{chat.updatedAt.toLocaleString()}
      </Text>
    </Pressable>
  );
};

const enhance = withObservables(["chat"], ({ chat }: { chat: Chat }) => ({
  chat,
}));

const EnhancedChatListItem = enhance(ChatListItem);

export default ChatList;
