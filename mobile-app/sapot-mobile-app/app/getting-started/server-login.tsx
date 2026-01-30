import { View } from "react-native";
import React, { useState } from "react";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import { Link, router } from "expo-router";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";

const ServerLoginScreen = () => {
  const theme = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Login" />
      <ScreenContent
        title="Welcome to SAPOT!"
        description="Please login to continue"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          <TextInput
            mode="outlined"
            label="Username"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={{ marginBottom: 16 }}
          />
          <TextInput
            mode="outlined"
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            style={{ marginBottom: 8 }}
          />
          {/* TODO: screen for forgot password */}
          <Link href="/getting-started/forgot-password" asChild>
            <Text
              variant="bodyMedium"
              style={{
                textDecorationLine: "underline",
                fontWeight: "bold",
                color: theme.colors.onPrimaryContainer,
                textAlign: "right",
              }}
            >
              Forgot password?
            </Text>
          </Link>
        </View>
        {/* For testing purposes */}
        <Button
          onPress={() => router.push("/(drawer)/(tabs)")}
          mode="contained"
          style={{ width: 280, marginBottom: 8 }}
        >
          Login
        </Button>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onPrimaryContainer }}
        >
          Don't have an account?{" "}
          <Link
            href="/getting-started/register"
            style={{ textDecorationLine: "underline", fontWeight: "bold" }}
          >
            Register here
          </Link>
        </Text>
      </ScreenContent>
    </View>
  );
};

export default ServerLoginScreen;
