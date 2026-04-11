import { Conversation, database, formatDate } from "@/features/shared";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Avatar, Text, useTheme } from "react-native-paper";

import { ChatRoomSource } from "@/features/chat/types";
import { usePeerService, useProfilePhoto } from "@/features/shared/hooks";
import { useChatService } from "../hooks";
import baseLogger from "@/features/shared/utils/logger";

const uiLog = baseLogger.extend("ui");
uiLog.debug("[chat-list] module loaded");

const enhanceChats = withObservables([], () => ({
  chats: database.get<Conversation>("conversations").query().observe(),
}));

const ChatList = enhanceChats(({ chats }: { chats: Conversation[] }) => {
  const theme = useTheme();
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          marginBottom: 20,
        }}
      >
        <Text
          variant="titleLarge"
          style={{
            fontWeight: 700,
            color: theme.dark ? "#9AA7C1" : "#103462",
          }}
        >
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
          <Text
            style={{ color: theme.dark ? "#121A2E" : "#FFF", fontSize: 13 }}
          >
            Peer requests
          </Text>
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
  const theme = useTheme();
  const chatService = useChatService();
  const peerService = usePeerService();
  const [peerName, setPeerName] = useState("Loading...");
  const [peerId, setPeerId] = useState<string | null>(null);
  const { url: peerProfilePicUrl } = useProfilePhoto(peerId);

  useEffect(() => {
    let isMounted = true;

    const loadPeerName = async () => {
      try {
        uiLog.debug("chat-list › load peer", { chatId: chat.id });
        const resolvedPeerId = await chatService.findPeerIdByChatId(chat.id);
        setPeerId(resolvedPeerId);
        const peer = await peerService.findPeerById(resolvedPeerId);

        if (!isMounted) return;

        if (!peer) {
          setPeerName("Unknown peer");
          return;
        }

        const fullName = `${peer.firstName || ""} ${
          peer.lastName || ""
        }`.trim();
        setPeerName(fullName || peer.username || "Unknown peer");

      } catch (error) {
        uiLog.warn("chat-list › load peer failed", {
          chatId: chat.id,
          error,
        });
        if (isMounted) setPeerName("Unknown peer");
      }
    };

    loadPeerName();

    return () => {
      isMounted = false;
    };
  }, [chat.id, chatService, peerService]);

  // const handleResend = useCallback(
  //   async (chatId: string) => {
  //     const peerId = await chatService.findPeerIdByChatId(chatId);
  //     const peer = peerService.findDiscoveredPeerById(peerId);

  //     // TODO: catch
  //     if (!peer) throw Error("Peer not found");

  //     await discoveryService.performResendMessagesForPeer(
  //       peerId,
  //       peer.ipAddress,
  //       peer.port
  //     );
  //   },
  //   [chatService, peerService, discoveryService]
  // );

  return (
    <Pressable
      onPress={() => {
        uiLog.info("chat-list › open chat", { chatId: chat.id });
        router.push({
          pathname: "/(drawer)/(tabs)/chat/[id]",
          params: { id: chat.id, source: ChatRoomSource.CHAT },
        });
      }}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderColor: theme.dark ? "#0B1020" : "#EEEEEE",
        backgroundColor: theme.dark ? "#121A2E" : "",
        borderTopWidth: 2,
        borderBottomWidth: 2,
        borderRadius: 4,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {peerProfilePicUrl ? (
          <Avatar.Image size={60} source={{ uri: peerProfilePicUrl }} />
        ) : (
          <Avatar.Text
            size={60}
            label={(peerName[0] ?? "?").toUpperCase()}
          />
        )}
        <View style={{ flexGrow: 1, marginLeft: 16 }}>
          <Text
            style={{ fontSize: 17, color: theme.dark ? "#E6ECF5" : "#1E1E1E" }}
          >
            {peerName}
          </Text>
          <Text
            style={{ fontSize: 17, color: theme.dark ? "#6E7891" : "#6B7280" }}
          >
            messages
            {/* TODO: make a message field in the conversation table */}
          </Text>
        </View>
        <Text
          style={{
            alignSelf: "flex-end",
            color: theme.dark ? "#6E7891" : "#6B7280",
          }}
        >
          {formatDate(chat.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
});

export default ChatList;
