import { Text, View } from "@/components/Themed";
import { Pressable } from "react-native";
import React from "react";
import { useRouter } from "expo-router";

const Index = () => {
  const router = useRouter();

  return (
    <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
      <Pressable onPress={() => router.push("/(tabs)")}>
        <Text>Get Started</Text>
      </Pressable>
    </View>
  );
};

export default Index;
