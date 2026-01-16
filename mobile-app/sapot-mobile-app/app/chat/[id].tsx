import { View, Text, ActivityIndicator, Pressable } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useChatService, useConnectionService } from "@/features/chat";

const ChatRoom = () => {
  const { id } = useLocalSearchParams();
  const connectionService = useConnectionService();
  const [isConnected, setIsConnected] = useState(false);
  const chatService = useChatService();

  useEffect(() => {
    const connect = async () => {
      try {
        await connectionService.connectToPeer(id as string);
        setIsConnected(true);
      } catch (error) {
        console.error("Connection failed", error);
      }
    };
    connect();

    return () => connectionService.disconnect();
  }, []);

  if (!isConnected) return <ActivityIndicator />;

  return (
    <View>
      <Text>ChatRoom {id}</Text>
      <Pressable
        onPress={() =>
          chatService.sendChatMessage({ type: "chat", data: "Hello" })
        }
      >
        <Text>Send Message</Text>
      </Pressable>
    </View>
  );
};

export default ChatRoom;
