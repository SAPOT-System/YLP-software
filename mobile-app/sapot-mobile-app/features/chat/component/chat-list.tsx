import { View, FlatList, Pressable } from "react-native";
import { Text } from "react-native-paper";
import React, { useCallback } from "react";
import { useRouter } from "expo-router";
import { withObservables } from "@nozbe/watermelondb/react";
import { Conversation, database } from "@/features/shared";

import { ChatRoomSource } from "@/features/chat/types";
import { useChatService } from "../hooks";
import { usePeerService, useDiscoveryService } from "@/features/shared/hooks";

const enhanceChats = withObservables([], () => ({
  chats: database.get<Conversation>("conversations").query().observe(),
}));

const ChatList = enhanceChats(({ chats }: { chats: Conversation[] }) => {
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="titleLarge" style={{ fontWeight: 700 }}>
          Chats
        </Text>
        <View
          style={{
            backgroundColor: "#3A7AFE",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 2,
            borderRadius: 999,
            elevation: 6,
          }}
        >
          <Text style={{ color: "white", fontSize: 13 }}>Peer requests</Text>
        </View>
      </View>
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
          pathname: "/(drawer)/(tabs)/chat/[id]",
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
