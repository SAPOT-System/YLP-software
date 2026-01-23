import { View, Text, FlatList, Pressable } from "react-native";
import React, { useCallback } from "react";
import { useRouter } from "expo-router";
import { withObservables } from "@nozbe/watermelondb/react";
import {
  Conversation,
  database,
  useChatService,
  useDiscoveryService,
  usePeerService,
} from "@/features/shared";
import { ChatRoomSource } from "@/features/chat/types";

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
  const chatService = useChatService();
  const peerService = usePeerService();
  const discoveryService = useDiscoveryService();

  const handleResend = useCallback(
    async (chatId: string) => {
      const peerId = await chatService.findPeerIdByChatId(chatId);
      const peer = peerService.findDiscoveredPeerById(peerId);

      // TODO: catch
      if (!peer) throw Error("Peer not found");

      await discoveryService.performResendMessagesForPeer(
        peerId,
        peer.ipAddress,
        peer.port
      );
    },
    [chatService, peerService, discoveryService]
  );

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
      <Pressable onPress={() => handleResend(chat.id)}>
        <Text>Resend</Text>
      </Pressable>
    </Pressable>
  );
});

export default ChatList;
