import { useCallService } from "@/features/call";
import { MessageList, useChatService } from "@/features/chat";
import { ChatRoomSource } from "@/features/chat/types";
import { Peer } from "@/features/shared";
import { usePeerService, useToast } from "@/features/shared/hooks";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Appbar, Avatar, IconButton, Snackbar } from "react-native-paper";

const ChatRoom = () => {
  const { id, source } = useLocalSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [peerId, setPeerId] = useState<string | undefined>();
  const [peer, setPeer] = useState<Peer | undefined>();
  const [message, setMessage] = useState("");
  const chatService = useChatService();
  const peerService = usePeerService();
  const router = useRouter();
  const callService = useCallService();
  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();

  // This will initialize the connection to the peer and conversations by the id params
  useEffect(() => {
    const connect = async () => {
      if (source === ChatRoomSource.PEER) {
        setPeerId(id as string);
        const chatId = await chatService.findChatByPeer(id as string);
        if (chatId) setConversationId(chatId);
      } else if (source === ChatRoomSource.CHAT) {
        setPeerId(await chatService.findPeerIdByChatId(id as string));
        setConversationId(id as string);
      } else {
        throw Error("Error in passed source paramater");
      }
      setIsRendered(true);
    };
    connect();
  }, [chatService, id, source]);

  useEffect(() => {
    if (!peerId) return;

    const connect = async () => {
      try {
        await chatService.connect(peerId);
        setIsConnected(true);
      } catch (error) {
        console.warn("Connection failed", error);
        showToast("Connection failed");
        // TODO: try reconnect
      }
    };

    connect();

    return () => {
      chatService.disconnect();
    };
  }, [peerId, chatService, showToast]);

  useEffect(() => {
    if (!peerId) return;

    const getPeer = async () => {
      try {
        const foundPeer = await peerService.findPeerById(peerId);
        setPeer(foundPeer);
      } catch (error) {
        console.error("[ChatRoom]: Error retrieving peer data", error);
      }
    };

    getPeer();
  }, [peerId, peerService]);

  if (!isRendered) return <ActivityIndicator />;

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    try {
      const chatId = await chatService.sendChatMessage(message);

      if (!conversationId && chatId) {
        setConversationId(chatId);
      }

      setMessage("");
    } catch (error) {
      console.error("[ChatRoom]: Error handling message:", error);
    }
  };

  const handleCall = async (peerId: string) => {
    callService.informPeerForIncomingAudioCall(peerId);
    await callService.startCall(peerId);
    router.push({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: peerId! },
    });
  };

  const peerDisplayName = peer
    ? `${peer.firstName} ${peer.lastName}`.trim() || peer.username
    : "Unknown user";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <View style={styles.header}>
        <View style={styles.headerLeftGroup}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Avatar.Text
            size={40}
            label={peer?.firstName?.[0]?.toUpperCase() ?? "?"}
          />
          <View style={styles.identityGroup}>
            <Text style={styles.nameText} numberOfLines={1}>
              {peerDisplayName}
            </Text>
            <Text style={styles.statusText} numberOfLines={1}>
              {isConnected
                ? "Connected"
                : peer?.isOnline
                ? "Active now"
                : "Offline"}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <IconButton
            icon="phone"
            size={20}
            iconColor="#00E700"
            onPress={() => peerId && handleCall(peerId)}
            style={styles.headerActionButton}
          />
          <IconButton
            icon="video"
            size={20}
            onPress={() => peerId && handleCall(peerId)}
            style={styles.headerActionButton}
          />
          <IconButton
            icon="dots-vertical"
            size={20}
            style={styles.headerActionButton}
          />
        </View>
      </View>

      <View style={styles.body}>
        {conversationId ? (
          <MessageList conversationId={conversationId} />
        ) : (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No messages yet</Text>
          </View>
        )}
      </View>

      <View style={styles.composerContainer}>
        <TextInput
          style={styles.input}
          onChangeText={setMessage}
          value={message}
          placeholder="Message..."
          placeholderTextColor="#8A8A8A"
        />
        {/* <Pressable style={styles.sendButton} onPress={handleSendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable> */}
        <IconButton icon="send" size={30} onPress={handleSendMessage} />
      </View>

      <Snackbar
        visible={toastVisible}
        onDismiss={hideToast}
        duration={3000}
        theme={{
          colors: { inverseSurface: "#696969", inverseOnSurface: "#FFFFFF" },
        }}
      >
        {toastMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    height: 82,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  identityGroup: {
    marginLeft: 10,
    justifyContent: "center",
    flex: 1,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    marginRight: 4,
  },
  nameText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#151515",
  },
  statusText: {
    fontSize: 12,
    color: "#6E6E6E",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    marginLeft: 2,
  },
  headerActionButton: {
    margin: 0,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    color: "#7A7A7A",
    fontSize: 14,
  },
  composerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    minHeight: 60,
    maxHeight: 120,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingVertical: 20,
    backgroundColor: "#C9C9C9",
    color: "#111111",
  },
  sendButton: {
    height: 40,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#3A7AFE",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default ChatRoom;
