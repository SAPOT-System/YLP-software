import { APP_ROUTES } from "@/config/routes";
import { useInformCall } from "@/features/call";
import { MessageList, useChatService } from "@/features/chat";
import { ChatRoomSource } from "@/features/chat/types";
import { Peer } from "@/features/shared";
import {
    useIsUserActive,
    usePeerService,
    useProfilePhoto,
    useToast,
} from "@/features/shared/hooks";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { uiLog } from "@/features/shared/utils/logger";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const [isSelfChat, setIsSelfChat] = useState(false);
  const [peer, setPeer] = useState<Peer | undefined>();
  const { url: peerProfilePicUrl } = useProfilePhoto(peerId ?? null);
  const isServerActive = useIsUserActive(peerId);
  const [message, setMessage] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatService = useChatService();
  const peerService = usePeerService();
  const userStore = useUserStore();
  const router = useRouter();
  const call = useInformCall();
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

    // Abort previous request if it's still in-flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    const connect = async () => {
      if (signal.aborted) return;

      if (source === ChatRoomSource.PEER) {
        const resolvedPeerId = id as string;
        const isSelf = resolvedPeerId === userStore.user?.id;
        uiLog.debug("[ChatRoom] peer resolved from PEER source", {
          resolvedPeerId,
          isSelf,
        });
        setIsSelfChat(isSelf);
        setPeerId(resolvedPeerId);

        if (signal.aborted) return;
        const chatId = await chatService.findChatByPeer(resolvedPeerId);
        if (signal.aborted) return;

        if (chatId) setConversationId(chatId);
      } else if (source === ChatRoomSource.CHAT) {
        const foundPeerId = await chatService.findPeerIdByChatId(id as string);
        if (signal.aborted) return;

        const isSelf = foundPeerId === userStore.user?.id;
        uiLog.debug("[ChatRoom] peer resolved from CHAT source", {
          foundPeerId,
          isSelf,
        });
        setIsSelfChat(isSelf);
        setPeerId(foundPeerId);
        setConversationId(id as string);
      } else {
        throw Error("Error in passed source paramater");
      }

      if (signal.aborted) return;
      setIsRendered(true);
    };
    connect();

    return () => {
      abortControllerRef.current = null;
    };
  }, [chatService, id, source, userStore]);

  useEffect(() => {
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", { peerId });
    if (!peerId) return;
    if (isSelfChat) return;

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
  }, [peerId, isSelfChat, chatService, showToast]);

  useEffect(() => {
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", { isSelfChat });
    if (!isSelfChat || !peerId) return;
    const connect = async () => {
      chatService.setPeer(peerId);
      setIsConnected(true);
      setConnectionState("connected");
    };
    connect();

    return () => {
      chatService.removePeer();
    };
  }, [isSelfChat, peerId, chatService]);

  // Notify the sender that messages have been seen when connected and viewing a conversation
  useFocusEffect(
    useCallback(() => {
      uiLog.debug("[ChatRoom] useEffect triggered, deps:", {
        isConnected,
        conversationId,
      });
      if ((!isConnected && !isSelfChat) || !conversationId) return;
      chatService.markConversationAsRead(conversationId);
    }, [isConnected, isSelfChat, conversationId, chatService])
  );

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
    : isServerActive || peer?.isOnline
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
            disabled={isSelfChat}
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
            disabled={isSelfChat}
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
          <MessageList conversationId={conversationId} peerId={peerId ?? ""} />
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
