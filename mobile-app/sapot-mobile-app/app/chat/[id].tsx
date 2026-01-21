import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { MessageList, useChatService } from "@/features/chat";
import { Message } from "@/features/shared";

// This is enum for determining where the chat room is triggered, it is either in peer list item or chat list item
export enum ChatRoomSource {
  PEER = "peer_list",
  CHAT = "chat_list",
}

const ChatRoom = () => {
  const { id, source } = useLocalSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const chatService = useChatService();

  // This will initialize the connection to the peer and conversations by the id params
  useEffect(() => {
    const connect = async () => {
      try {
        let peerId = "";
        if (source === ChatRoomSource.PEER) {
          peerId = id as string;
          const chatId = await chatService.findChatByPeer(peerId);
          if (chatId) setConversationId(chatId);
        } else if (source === ChatRoomSource.CHAT) {
          peerId = await chatService.findPeerIdByChatId(id as string);
          setConversationId(id as string);
        } else {
          throw Error("Error in passed source paramater");
        }
        await chatService.connect(peerId as string);
        setIsConnected(true);
      } catch (error) {
        console.warn("Connection failed", error);
        // TODO: try reconnect
      } finally {
        setIsRendered(true);
      }
    };
    connect();

    return () => {
      chatService.disconnect();
      chatService.cleanUp();
    };
  }, []);

  if (!isRendered) return <ActivityIndicator />;

  const handleSendMessage = () => {
    chatService.sendChatMessage(message);
    setMessage("");
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
