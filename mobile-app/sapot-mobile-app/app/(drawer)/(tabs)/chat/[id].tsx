import { APP_ROUTES } from "@/app/routes";
import { useCall } from "@/features/call";
import { MessageList, useChatService } from "@/features/chat";
import { ChatRoomSource } from "@/features/chat/types";
import { Peer } from "@/features/shared";
import {
    usePeerService,
    useProfilePhoto,
    useToast,
} from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    Appbar,
    Avatar,
    IconButton,
    Snackbar,
    useTheme,
} from "react-native-paper";

const ChatRoom = () => {
  const { id, source } = useLocalSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "failed" | "timeout" | "idle"
  >("idle");
  const [isRendered, setIsRendered] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [peerId, setPeerId] = useState<string | undefined>();
  const [peer, setPeer] = useState<Peer | undefined>();
  const { url: peerProfilePicUrl } = useProfilePhoto(peerId ?? null);
  const [message, setMessage] = useState("");
  const chatService = useChatService();
  const peerService = usePeerService();
  const router = useRouter();
  const call = useCall();
  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[ChatRoom] mounted");
    return () => {
      uiLog.info("[ChatRoom] unmounted");
    };
  }, []);

  // This will initialize the connection to the peer and conversations by the id params
  useEffect(() => {
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", {
      id,
      source,
    });
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
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", { peerId });
    if (!peerId) return;

    const connect = async () => {
      try {
        await chatService.connect(peerId);
        setIsConnected(true);
      } catch (error) {
        uiLog.warn("chat › connect failed", { peerId, error });
        showToast("Connection failed");
        // TODO: try reconnect
      }
    };

    connect();

    const unsubscribe = chatService.onConnectionState((payload) => {
      if (payload.peerId !== peerId) return;
      setConnectionState(payload.state);
      setIsConnected(payload.state === "connected");
    });

    return () => {
      unsubscribe();
      chatService.disconnect();
    };
  }, [peerId, chatService, showToast]);

  useEffect(() => {
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", { peerId });
    if (!peerId) return;

    const getPeer = async () => {
      try {
        const foundPeer = await peerService.findPeerById(peerId);
        setPeer(foundPeer);
      } catch (error) {
        uiLog.error("chat › load peer failed", { peerId, error });
      }
    };

    getPeer();
  }, [peerId, peerService]);

  if (!isRendered) return <ActivityIndicator />;

  const handleSendMessage = async () => {
    uiLog.debug("[ChatRoom] handleSendMessage called", {
      hasMessage: Boolean(message.trim()),
      conversationId,
    });
    if (!message.trim()) return;
    try {
      const chatId = await chatService.sendChatMessage(message);

      if (!conversationId && chatId) {
        setConversationId(chatId);
      }

      setMessage("");
    } catch (error) {
      uiLog.error("chat › send message failed", {
        conversationId,
        error,
      });
    }
  };

  const peerDisplayName = peer
    ? `${peer.firstName} ${peer.lastName}`.trim() || peer.username
    : "Unknown user";
  const connectionStatusLabel = isConnected
    ? "Connected"
    : connectionState === "connecting"
    ? "Connecting..."
    : connectionState === "timeout"
    ? "Connection timeout"
    : connectionState === "failed"
    ? "Connection failed"
    : peer?.isOnline
    ? "Active now"
    : "Offline";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 20}
    >
      <View style={styles.header}>
        <View style={styles.headerLeftGroup}>
          <Appbar.BackAction
            onPress={() => {
              uiLog.info("[Navigation] goBack triggered from ChatRoom");
              router.back();
            }}
          />
          {peerProfilePicUrl ? (
            <Avatar.Image size={40} source={{ uri: peerProfilePicUrl }} />
          ) : (
            <Avatar.Text
              size={40}
              label={peer?.firstName?.[0]?.toUpperCase() ?? "?"}
            />
          )}
          <View style={styles.identityGroup}>
            <Text
              style={[
                styles.nameText,
                { color: theme.dark ? "#E6ECF5" : "#000000" },
              ]}
              numberOfLines={1}
            >
              {peerDisplayName}
            </Text>
            <Text
              style={[
                styles.statusText,
                { color: theme.dark ? "#E6ECF5" : "#6B7280" },
              ]}
              numberOfLines={1}
            >
              {isConnected ? "Connected" : connectionStatusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <IconButton
            icon="phone"
            size={20}
            iconColor="#00E700"
            onPress={() => {
              uiLog.debug("[ChatRoom] onPress triggered");
              if (peerId) {
                uiLog.info("[ChatRoom] start call", { type: "audio", peerId });
                call("audio", peerId);
              }
            }}
            style={styles.headerActionButton}
          />
          <IconButton
            icon="video"
            size={20}
            onPress={() => {
              uiLog.debug("[ChatRoom] onPress triggered");
              if (peerId) {
                uiLog.info("[ChatRoom] start call", { type: "video", peerId });
                call("video", peerId);
              }
            }}
            style={styles.headerActionButton}
          />
          <IconButton
            icon="dots-vertical"
            size={20}
            onPress={() => {
              uiLog.debug("[ChatRoom] onPress triggered");
              if (peerId) {
                uiLog.info("[Navigation] Navigating to PeerProfile", {
                  screen: APP_ROUTES.PEER_PROFILE,
                  peerId,
                });
                router.push({
                  pathname: APP_ROUTES.PEER_PROFILE,
                  params: { id: peerId },
                });
              }
            }}
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
          style={[
            styles.input,
            {
              backgroundColor: theme.dark ? "#1A233A" : "#C9C9C9",
              color: theme.dark ? "#FFF" : "#000",
            },
          ]}
          onChangeText={setMessage}
          value={message}
          placeholder="Message..."
          placeholderTextColor="#696969"
        />
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
  },
  statusText: {
    fontSize: 12,
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
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    color: "#758695",
    fontSize: 14,
  },
  composerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    minHeight: 60,
    maxHeight: 120,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
});

export default ChatRoom;
