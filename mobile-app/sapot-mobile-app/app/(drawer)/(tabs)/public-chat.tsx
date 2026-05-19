import { usePublicChat } from "@/features/chat/hooks/use-public-chat";
import { PublicChatMessage } from "@/features/chat/types";
import { formatDate } from "@/features/shared";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { uiLog } from "@/features/shared/utils/logger";
import { useHeaderHeight } from "@react-navigation/elements";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";

export default function PublicChat() {
  const theme = useTheme();
  const [message, setMessage] = useState("");
  const { messages, sendMessage, isConnected, isAvailable, isLoadingHistory, hasMoreHistory, loadMoreHistory } = usePublicChat();
  const listRef = useRef<FlatList<PublicChatMessage>>(null);
  const userStore = useUserStore();
  const myId = userStore.user.id;
  const headerHeight = useHeaderHeight();

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
        {isConnected ? (
          <>
            <View style={styles.dotConnected} />
            <Text style={styles.statusTextConnected}>Connected</Text>
          </>
        ) : (
          <>
            <View style={styles.dotConnecting} />
            <Text style={styles.statusTextConnecting}>Connecting…</Text>
            <ActivityIndicator size="small" color="#F5A623" style={styles.statusSpinner} />
          </>
        )}
      </View>

      <View style={styles.body}>
        {messages.length === 0 && isLoadingHistory ? (
          <View style={styles.emptyStateContainer}>
            <ActivityIndicator size="small" color="#758695" />
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
                    <ActivityIndicator size="small" color="#758695" />
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
            renderItem={({ item }) => {
              const isOutgoing = item.sender_id === myId;
              const senderLabel = `${item.sender_id.slice(0, 8)}…`;
              const timeLabel = formatDate(item.received_at);

              if (isOutgoing) {
                return (
                  <View style={styles.outgoingBubble}>
                    <Text style={styles.outgoingLabel}>
                      You, {timeLabel}
                    </Text>
                    <Text style={styles.outgoingContent}>{item.content}</Text>
                  </View>
                );
              }
              return (
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
        />
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
  input: {
    flex: 1,
    minHeight: 60,
    maxHeight: 120,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingVertical: 20,
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
