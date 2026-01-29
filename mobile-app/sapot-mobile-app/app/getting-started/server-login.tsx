import { View, Text } from "react-native";
import React from "react";
import { Button } from "react-native-paper";
import { useRouter } from "expo-router";

const ServerLogin = () => {
  const router = useRouter();
  return (
    <View>
      <Text>ServerLogin</Text>
      {/* For testing purposes */}
      <Button onPress={() => router.push("/(tabs)")} mode="contained">
        Continue to main app
      </Button>
    </View>
  );
};

export default ServerLogin;
