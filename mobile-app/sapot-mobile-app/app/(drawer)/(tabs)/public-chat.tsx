import { usePublicChat } from "@/features/chat/hooks/use-public-chat";
import { MAX_MESSAGE_LENGTH, PublicChatMessage } from "@/features/chat/types";
import motion from "@/constants/motion";
import { formatDate } from "@/features/shared";
import { useReducedMotion } from "@/features/shared/hooks";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { uiLog } from "@/features/shared/core/utils/logger";
import { useHeaderHeight } from "@react-navigation/elements";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { Easing, FadeInUp } from "react-native-reanimated";
import { IconButton, Text, useTheme } from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";
import { Crossfade } from "@/features/shared/components/crossfade";

export default function PublicChat() {
  const theme = useTheme();
  const [message, setMessage] = useState("");
  const { messages, sendMessage, isConnected, isAvailable, isLoadingHistory, hasMoreHistory, loadMoreHistory } = usePublicChat();
  const listRef = useRef<FlatList<PublicChatMessage>>(null);
  const userStore = useUserStore();
  const myId = userStore.hasUser ? userStore.user.id : "";
  const headerHeight = useHeaderHeight();
  const reducedMotion = useReducedMotion();
  const seenIdsRef = useRef<Set<string> | null>(null);

  if (seenIdsRef.current === null) {
    seenIdsRef.current = new Set(
      messages.map((message, index) => message.id ?? String(index))
    );
  }

  useEffect(() => {
    uiLog.info("[PublicChat] mounted");
    return () => {
      uiLog.info("[PublicChat] unmounted");
    };
  }, []);

  const prevLengthRef = useRef(messages.length);
  useEffect(() => {
    const delta = messages.length - prevLengthRef.current;
    prevLengthRef.current = messages.length;
    // only auto-scroll for single new messages, not bulk history prepends
    if (delta === 1) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || !isConnected) return;
    sendMessage(trimmed);
    setMessage("");
  };

  if (!isAvailable) {
    return (
      <View style={styles.unavailableContainer}>
        <Text style={styles.unavailableText}>
          Public chat is unavailable in LAN mode or for guest users.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, paddingTop: headerHeight }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 20}
    >
      {/* Connection status bar */}
      <View style={styles.statusBar}>
        <Crossfade activeKey={isConnected ? "connected" : "connecting"}>
          {isConnected ? (
            <View style={styles.statusBar}>
              <View style={styles.dotConnected} />
              <Text style={styles.statusTextConnected}>Connected</Text>
            </View>
          ) : (
            <View style={styles.statusBar}>
              <View style={styles.dotConnecting} />
              <Text style={styles.statusTextConnecting}>Connecting…</Text>
              <LoadingSpinner style={styles.statusSpinner} />
            </View>
          )}
        </Crossfade>
      </View>

      <View style={styles.body}>
        {messages.length === 0 && isLoadingHistory ? (
          <View style={styles.emptyStateContainer}>
            <LoadingSpinner />
            <Text style={[styles.emptyStateText, { marginTop: 8 }]}>
              Loading messages…
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>
              {isConnected ? "No messages yet" : "Waiting for connection…"}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, index) => item.id ?? String(index)}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            ListHeaderComponent={
              hasMoreHistory ? (
                <View style={styles.loadEarlierContainer}>
                  {isLoadingHistory ? (
                    <LoadingSpinner />
                  ) : (
                    <Text
                      style={styles.loadEarlierText}
                      onPress={loadMoreHistory}
                    >
                      Load earlier messages
                    </Text>
                  )}
                </View>
              ) : null
            }
            renderItem={({ item, index }) => {
              const isOutgoing = item.sender_id === myId;
              const senderLabel = item.sender_name ?? `${item.sender_id.slice(0, 8)}…`;
              const timeLabel = formatDate(item.received_at);
              const itemId = item.id ?? String(index);
              const isNewMessage = !seenIdsRef.current!.has(itemId);
              seenIdsRef.current!.add(itemId);

              const bubble = isOutgoing ? (
                <View style={styles.outgoingBubble}>
                  <Text style={styles.outgoingLabel}>
                    You, {timeLabel}
                  </Text>
                  <Text style={styles.outgoingContent}>{item.content}</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.incomingBubble,
                    {
                      backgroundColor: theme.dark ? "#1A233A" : "#EAEDF3",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.incomingLabel,
                      { color: theme.dark ? "#737171" : "#6A6A6A" },
                    ]}
                  >
                    {senderLabel}, {timeLabel}
                  </Text>
                  <Text
                    style={[
                      styles.incomingContent,
                      { color: theme.dark ? "#737171" : "#000000" },
                    ]}
                  >
                    {item.content}
                  </Text>
                </View>
              );

              if (reducedMotion || !isNewMessage) {
                return bubble;
              }

              return (
                <Animated.View
                  entering={FadeInUp.duration(motion.duration.base).easing(
                    Easing.bezier(...motion.easing.standard)
                  )}
                >
                  {bubble}
                </Animated.View>
              );
            }}
            contentContainerStyle={styles.messageList}
          />
        )}
      </View>

      <View
        style={[
          styles.composerContainer,
          {
            borderTopColor: theme.dark ? "#1E2A40" : "#DDDDDD",
          },
        ]}
      >
        <View style={styles.inputWrapper}>
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
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={isConnected}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
          />
          {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
            <Text style={styles.charCounter}>
              {message.length}/{MAX_MESSAGE_LENGTH}
            </Text>
          )}
        </View>
        <IconButton
          icon="send"
          size={30}
          onPress={handleSend}
          disabled={!isConnected || !message.trim()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  dotConnected: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  dotConnecting: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F5A623",
  },
  statusTextConnected: {
    fontSize: 12,
    color: "#4CAF50",
  },
  statusTextConnecting: {
    fontSize: 12,
    color: "#F5A623",
  },
  statusSpinner: {
    marginLeft: 2,
  },
  composerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flex: 1,
  },
  input: {
    minHeight: 60,
    maxHeight: 120,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
  charCounter: {
    position: "absolute",
    right: 16,
    bottom: 4,
    fontSize: 11,
    color: "#696969",
  },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  messageList: {
    paddingBottom: 4,
  },
  loadEarlierContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  loadEarlierText: {
    color: "#758695",
    fontSize: 13,
  },
  outgoingBubble: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    backgroundColor: "#3A7AFE",
    borderRadius: 4,
    padding: 10,
  },
  outgoingLabel: {
    color: "#DFD8D8",
    fontSize: 14,
  },
  outgoingContent: {
    color: "#FFFFFF",
    fontSize: 17,
  },
  incomingBubble: {
    alignSelf: "flex-start",
    maxWidth: "80%",
    borderRadius: 12,
    padding: 10,
  },
  incomingLabel: {
    fontSize: 14,
  },
  incomingContent: {
    fontSize: 17,
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
  unavailableContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  unavailableText: {
    color: "#758695",
    fontSize: 14,
    textAlign: "center",
  },
});
