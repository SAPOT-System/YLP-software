import { AuthTextInput, PrimaryButton, useAuth } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { router } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { ActivityIndicator, HelperText } from "react-native-paper";

const LanLoginScreen = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }
  const { loginAsGuest, errors } = auth;

  const handleLogin = () => {
    const res = loginAsGuest({ firstName, lastName });
    if (res.success) {
      router.replace("/(drawer)/(tabs)");
    }
  };

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
          <AuthTextInput
            label="First Name"
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
          />
          <HelperText type="error" visible={!!errors.firstName}>
            {errors.firstName}
          </HelperText>
          <AuthTextInput
            label="Last Name"
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
          />
          <HelperText type="error" visible={!!errors.lastName}>
            {errors.lastName}
          </HelperText>
        </View>
        {/* TODO: save the entered username using User Service class */}
        <PrimaryButton onPress={handleLogin} style={{ width: 280 }}>
          Login
        </PrimaryButton>
      </ScreenContent>
    </View>
  );
};

export default LanLoginScreen;
