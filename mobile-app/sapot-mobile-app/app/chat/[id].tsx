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
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[] | undefined>();
  const chatService = useChatService();

  // This will initialize the connection to the peer and conversations by the id params
  useEffect(() => {
    // TODO: Allow user to chat even if not connected.
    const connect = async () => {
      try {
        let peerId = "";
        if (source === ChatRoomSource.PEER) {
          peerId = id as string;
        } else if (source === ChatRoomSource.CHAT) {
          peerId = await chatService.findPeerIdByChatId(id as string);
          await chatService.initializePeerByChatId(id as string);
          const retreiveMessages =
            await chatService.getMessagesFromConversation();
          setMessages(retreiveMessages);
        } else {
          throw Error("Error in passed source paramater");
        }

        setIsConnected(true);
        await chatService.connect(peerId as string);
      } catch (error) {
        console.error("Connection failed", error);
      }
    };
    connect();

    return () => chatService.disconnect();
  }, []);

  if (!isConnected) return <ActivityIndicator />;

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
        {id}
      </Text>
      <TextInput
        style={styles.input}
        onChangeText={setMessage}
        value={message}
        placeholder="Message"
      />

      <Pressable onPress={handleSendMessage}>
        <Text>Send Message</Text>
      </Pressable>
      <MessageList messages={messages} />
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
