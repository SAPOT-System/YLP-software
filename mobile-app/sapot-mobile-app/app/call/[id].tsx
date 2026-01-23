import { View, Text, Pressable } from "react-native";
import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallService } from "@/features/shared";

// TODO: This component can minimized
const CallRoom = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const callService = useCallService();

  const handleEndCall = async () => {
    await callService.terminateCallConnection(id as string);
    router.back();
  };
  return (
    <View>
      <Text>CallRoom {id}</Text>
      <Pressable onPress={handleEndCall}>
        <Text>End call</Text>
      </Pressable>
    </View>
  );
};

export default CallRoom;
