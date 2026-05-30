import { APP_ROUTES } from "@/config/routes";
import { useInformCall } from "@/features/call";
import { MessageList, useChatService } from "@/features/chat";
import { ChatRoomSource } from "@/features/chat/types";
import { Conversation, ConversationType, Message, Peer, database } from "@/features/shared";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { Q } from "@nozbe/watermelondb";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import {
  useIsUserActive,
  useMainContainer,
  useProfilePhoto,
  useThrottledPress,
  useToast,
} from "@/features/shared/hooks";
import { sendSmsToUser } from "@/features/shared/api/gsm.api";
import { useGsmHealth } from "@/features/shared/hooks/use-gsm-health";
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
import { Appbar, Avatar, Chip, IconButton, useTheme } from "react-native-paper";

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: "#7C3AED", text: "#FFFFFF" },
  rescuer: { bg: "#059669", text: "#FFFFFF" },
};

const RoleBadge = ({ role }: { role?: string }) => {
  if (!role || role === "user") return null;
  const colors = ROLE_COLORS[role];
  if (!colors) return null;
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
        marginLeft: 6,
        alignSelf: "center",
      }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
};

const MAX_RECONNECT_RETRIES = 5;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

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
  const [incomingMessageCount, setIncomingMessageCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSmsMode, setIsSmsMode] = useState(false);
  const [conversationType, setConversationType] = useState<ConversationType | undefined>();
  const isSmsConversation = conversationType === ConversationType.SMS;
  const { gsmReady, loading: gsmLoading } = useGsmHealth();
  const chatService = useChatService();
  const userStore = useUserStore();
  const { connectionService, peerKeyService } = useMainContainer();
  const [peerIsGuest, setPeerIsGuest] = useState<boolean | null>(null);
  const router = useRouter();
  const call = useInformCall();
  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showToast,
    showError,
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

    // Reset immediately so stale data is not shown while async resolution runs
    setIsRendered(false);
    setConversationId(undefined);
    setPeerId(undefined);
    setIsSelfChat(false);
    setPeer(undefined);

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
        showError("Connection failed");
        // TODO: try reconnect
      }
    };

    connect();

    const unsubscribe = chatService.onConnectionState((payload) => {
      if (payload.peerId !== peerId) return;
      setConnectionState(payload.state);
      setIsConnected(payload.state === "connected");
      if (payload.state === "connected") {
        retryCountRef.current = 0;
      }
      if (payload.state === "failed" || payload.state === "timeout") {
        if (retryCountRef.current >= MAX_RECONNECT_RETRIES) return;
        const raw = Math.min(
          RECONNECT_MAX_MS,
          RECONNECT_BASE_MS * Math.pow(1.8, retryCountRef.current)
        );
        const delay = Math.round(raw * (0.8 + Math.random() * 0.4));
        retryCountRef.current += 1;
        uiLog.warn("chat › scheduling reconnect", {
          peerId,
          attempt: retryCountRef.current,
          delayMs: delay,
        });
        retryTimerRef.current = setTimeout(() => {
          chatService.connect(peerId).catch(() => {});
        }, delay);
      }
    });

    const unsubscribeReconnected = chatService.onPeerReconnected(
      (reconnectedPeerId) => {
        if (reconnectedPeerId !== peerId) return;
        retryCountRef.current = 0;
        setIsConnected(true);
        setConnectionState("connected");
      }
    );

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      unsubscribe();
      unsubscribeReconnected();
      chatService.disconnect();
    };
  }, [peerId, isSelfChat, chatService, showToast, showError]);

  useEffect(() => {
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", { isSelfChat });
    if (!isSelfChat || !peerId) return;
    const connect = async () => {
      await chatService.setPeer(peerId);
      setIsConnected(true);
      setConnectionState("connected");
    };
    connect();

    return () => {
      chatService.removePeer();
    };
  }, [isSelfChat, peerId, chatService]);

  useEffect(() => {
    if (!conversationId || !peerId) return;
    const subscription = database
      .get<Message>(Message.table)
      .query(Q.where("conversation", conversationId), Q.where("sender", peerId))
      .observeCount()
      .subscribe(setIncomingMessageCount);
    return () => subscription.unsubscribe();
  }, [conversationId, peerId]);

  useEffect(() => {
    if (!conversationId) return;
    const subscription = database
      .get<Conversation>(Conversation.table)
      .findAndObserve(conversationId)
      .subscribe({
        next: (convo) => setConversationType(convo.type),
        error: () => {},
      });
    return () => subscription.unsubscribe();
  }, [conversationId]);

  // Notify the sender that messages have been seen when connected and viewing a conversation
  useFocusEffect(
    useCallback(() => {
      uiLog.debug("[ChatRoom] useEffect triggered, deps:", {
        isConnected,
        conversationId,
      });

      if (!incomingMessageCount) return;
      if ((!isConnected && !isSelfChat && !isSmsConversation) || !conversationId) return;
      void chatService.markConversationAsRead(conversationId);
    }, [
      isConnected,
      isSelfChat,
      isSmsConversation,
      conversationId,
      chatService,
      incomingMessageCount,
    ])
  );

  useEffect(() => {
    uiLog.debug("[ChatRoom] useEffect triggered, deps:", { peerId });
    if (!peerId) return;

    const subscription = database
      .get<Peer>(Peer.table)
      .findAndObserve(peerId)
      .subscribe({
        next: setPeer,
        error: (err) =>
          uiLog.error("chat › peer observe failed", { peerId, error: err }),
      });

    return () => subscription.unsubscribe();
  }, [peerId]);

  // Resolve peer guest status once TCP connection is established.
  // Offline result comes from the handshake credential; online confirmation
  // via the server is attempted for authenticated users.
  useEffect(() => {
    if (!peerId || !isConnected) return;
    const handshakeResult = connectionService.getPeerIsGuest(peerId);
    setPeerIsGuest(handshakeResult);

    if (!userStore.isGuest) {
      void peerKeyService.fetchPeerType(peerId).then((result) => {
        if (result !== null) setPeerIsGuest(result);
      });
    }
  }, [peerId, isConnected, connectionService, peerKeyService, userStore.isGuest]);

  const isSmsEnabled =
    gsmReady &&
    !!peer?.phoneNumberVerified &&
    !userStore.isGuest &&
    !!(userStore.user as Peer).phoneNumberVerified;

  useEffect(() => {
    if (isSmsConversation) setIsSmsMode(true);
    else if (!isSmsEnabled) setIsSmsMode(false);
  }, [isSmsEnabled, isSmsConversation]);

  const handleSendMessage = useCallback(async () => {
    const textToSend = message.trim();
    uiLog.debug("[ChatRoom] handleSendMessage called", {
      hasMessage: Boolean(textToSend),
      conversationId,
    });
    if (!textToSend) return;
    try {
      if ((isSmsMode || isSmsConversation) && peerId) {
        // SMS-only path — bypass P2P entirely
        let smsMessageId: string;
        try {
          const { messageId } = await chatService.sendSmsChannelMessage(
            textToSend
          );
          smsMessageId = messageId;
        } catch (smsChannelError) {
          uiLog.error("chat › SMS channel message failed", {
            conversationId,
            error: smsChannelError,
          });
          showError("Failed to record SMS message");
          return;
        }

        sendSmsToUser(peerId, textToSend)
          .then((res) => {
            const status = res.ok
              ? MessageStatusType.DELIVERED
              : MessageStatusType.NOT_SENT;
            chatService
              .updateMessageStatus(smsMessageId, status)
              .catch(() => {});
            if (!res.ok) showError("SMS could not be delivered");
          })
          .catch(() => {
            chatService
              .updateMessageStatus(smsMessageId, MessageStatusType.NOT_SENT)
              .catch(() => {});
            showError("Message sent, but SMS delivery failed.");
          });

        setMessage("");
      } else {
        // App Chat path — P2P only
        const { conversationId: chatId } = await chatService.sendChatMessage(textToSend);
        if (!conversationId && chatId) setConversationId(chatId);
        setMessage("");
      }
    } catch (error) {
      uiLog.error("chat › send message failed", { conversationId, error });
      showError("Failed to send message");
    }
  }, [message, conversationId, chatService, isSmsMode, isSmsConversation, peerId, showError]);

  const handleAudioCall = useCallback(() => {
    if (peerId) {
      uiLog.info("[ChatRoom] start call", { type: "audio", peerId });
      call("audio", peerId);
    }
  }, [call, peerId]);

  const handleVideoCall = useCallback(() => {
    if (peerId) {
      uiLog.info("[ChatRoom] start call", { type: "video", peerId });
      call("video", peerId);
    }
  }, [call, peerId]);

  const { onPress: onSendMessage, busy: sending } =
    useThrottledPress(handleSendMessage);
  const { onPress: onAudioCall, busy: callingAudio } =
    useThrottledPress(handleAudioCall);
  const { onPress: onVideoCall, busy: callingVideo } =
    useThrottledPress(handleVideoCall);

  if (!isRendered) return <ActivityIndicator />;

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
            <View style={styles.nameRow}>
              <Text
                style={[
                  styles.nameText,
                  { color: theme.dark ? "#E6ECF5" : "#000000" },
                ]}
                numberOfLines={1}
              >
                {peerDisplayName}
              </Text>
              <RoleBadge role={peer?.role} />
              {peerIsGuest === true && (
                <Chip compact style={styles.guestChip} textStyle={styles.guestChipText}>
                  Guest
                </Chip>
              )}
            </View>
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
            disabled={isSelfChat || callingAudio || isSmsConversation}
            onPress={onAudioCall}
            style={styles.headerActionButton}
          />
          <IconButton
            icon="video"
            size={20}
            disabled={isSelfChat || callingVideo || isSmsConversation}
            onPress={onVideoCall}
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

      {(isSmsEnabled || isSmsConversation) && !gsmLoading && !isSelfChat && (
        <View style={styles.smsToggleRow}>
          <Chip
            icon="message-processing-outline"
            selected={!isSmsMode}
            onPress={() => !isSmsConversation && setIsSmsMode(false)}
            disabled={isSmsConversation}
            compact
            style={styles.modeChip}
          >
            App Chat
          </Chip>
          <Chip
            icon="message-text"
            selected={isSmsMode}
            onPress={() => setIsSmsMode(true)}
            compact
            style={styles.modeChip}
          >
            SMS
          </Chip>
        </View>
      )}

      {isSmsMode && !isSelfChat && (
        <View style={styles.smsWarningRow}>
          <IconButton
            icon="lock-open-variant"
            size={16}
            iconColor="#B45309"
            style={styles.warningIcon}
          />
          <Text style={styles.smsWarningText}>
            SMS messages are not end-to-end encrypted
          </Text>
        </View>
      )}

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
        <IconButton
          icon="send"
          size={30}
          onPress={onSendMessage}
          disabled={sending}
        />
      </View>

      <AppSnackbar
        visible={toastVisible}
        onDismiss={hideToast}
        variant={toastVariant}
      >
        {toastMessage}
      </AppSnackbar>
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  nameText: {
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  guestChip: {
    height: 20,
    backgroundColor: "#6B728020",
  },
  guestChipText: {
    fontSize: 10,
    lineHeight: 12,
    marginVertical: 0,
    marginHorizontal: 4,
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
  smsToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  modeChip: {
    marginRight: 8,
  },
  smsWarningRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  warningIcon: {
    margin: 0,
    marginRight: 2,
  },
  smsWarningText: {
    fontSize: 12,
    color: "#B45309",
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
