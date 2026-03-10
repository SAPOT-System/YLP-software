import { AuthTextInput, PrimaryButton } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { router } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";

const LanLoginScreen = () => {
  const [username, setUsername] = useState("");
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Login" />
      <ScreenContent
        title="Welcome to SAPOT!"
        description="Please enter your username"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          {/* TODO: implement error mechanism */}
          <AuthTextInput
            label="Username"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
          />
        </View>
        {/* TODO: save the entered username using User Service class */}
        <PrimaryButton
          onPress={() => router.push("/(drawer)/(tabs)")}
          style={{ width: 280 }}
        >
          Login
        </PrimaryButton>
      </ScreenContent>
    </View>
  );
};

export default LanLoginScreen;
