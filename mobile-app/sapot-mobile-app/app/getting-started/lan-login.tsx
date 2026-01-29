import { View, Text } from "react-native";
import React, { useState } from "react";
import { Button, TextInput } from "react-native-paper";
import { router } from "expo-router";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";

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
          <TextInput
            mode="outlined"
            label="Username"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
          />
        </View>
        {/* TODO: save the entered username using User Service class */}
        <Button
          onPress={() => router.push("/(tabs)")}
          mode="contained"
          style={{ width: 280 }}
        >
          Login
        </Button>
      </ScreenContent>
    </View>
  );
};

export default LanLoginScreen;
