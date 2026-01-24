import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChatRoomSource } from "@/features/chat/types";
import { useCallService, useChatService } from "@/features/shared/hooks";
import { MessageList } from "@/features/chat";

const ChatRoom = () => {
  const { id, source } = useLocalSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [peerId, setPeerId] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const chatService = useChatService();
  const router = useRouter();
  const callService = useCallService();

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

    return () => {
      chatService.disconnect();
      chatService.cleanUp();
    };
  }, [chatService, id, source]);

  useEffect(() => {
    if (!peerId) return;

    const connect = async () => {
      try {
        await chatService.connect(peerId);
        setIsConnected(true);
      } catch (error) {
        console.warn("Connection failed", error);
        // TODO: try reconnect
      }
    };

    connect();

    return () => {
      chatService.disconnect();
      chatService.cleanUp();
    };
  }, [peerId, chatService]);

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
    router.push({ pathname: "/call/[id]", params: { id: peerId! } });
  };

  return (
    <View>
      <Text>
        ChatRoom:{" "}
        {source === ChatRoomSource.PEER
          ? "Peer list source"
          : "Chat list source"}{" "}
        {id}, ConversationID: {conversationId}
      </Text>
      {!isConnected && <Text>Not connected</Text>}
      <TextInput
        style={styles.input}
        onChangeText={setMessage}
        value={message}
        placeholder="Message"
      />

      <Pressable onPress={handleSendMessage}>
        <Text>Send Message</Text>
      </Pressable>
      <Pressable onPress={() => handleCall(peerId!)}>
        <Text>Voice call</Text>
      </Pressable>
      {conversationId ? (
        <MessageList conversationId={conversationId} />
      ) : (
        <Text>No message</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
  },
});

export default ChatRoom;
