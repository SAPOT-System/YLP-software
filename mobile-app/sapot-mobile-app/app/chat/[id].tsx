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
import { useChatService } from "@/features/chat";

export enum ChatRoomType {
  PEER = "peer",
  CHAT = "chat",
}

const ChatRoom = () => {
  const { id, type } = useLocalSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState("");
  const chatService = useChatService();

  useEffect(() => {
    const connect = async () => {
      try {
        let peerId = "";
        if (type === ChatRoomType.PEER) {
          peerId = id as string;
        } else if (type === ChatRoomType.CHAT) {
          // TODO: Find the chat id by the peerId
        } else {
          throw Error("Error in passed type paramater");
        }
        await chatService.connect(peerId as string);
        setIsConnected(true);
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
      <Text>ChatRoom {id}</Text>
      <TextInput
        style={styles.input}
        onChangeText={setMessage}
        value={message}
        placeholder="Message"
      />

      <Pressable onPress={handleSendMessage}>
        <Text>Send Message</Text>
      </Pressable>
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
