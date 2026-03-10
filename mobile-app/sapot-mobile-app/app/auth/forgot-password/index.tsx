import { View } from "react-native";
import React from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { ResetOption, SecondaryButton } from "@/features/auth";
import { router } from "expo-router";

const ForgotPasswordScreen = () => {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Forgot Password"
        description="Please select an option to receive a password reset link."
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          <ResetOption option="email" />
          <ResetOption option="sms" />
          <ResetOption option="question" />
          <ResetOption option="recoveryKey" />
        </View>
      </ScreenContent>
      <SecondaryButton onPress={() => router.back()}>Back</SecondaryButton>
    </View>
  );
};

export default ForgotPasswordScreen;
