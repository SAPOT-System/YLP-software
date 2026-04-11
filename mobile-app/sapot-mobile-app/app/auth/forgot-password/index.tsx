import { ResetOption, SecondaryButton } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { authLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { View } from "react-native";

const ForgotPasswordScreen = () => {
  useEffect(() => {
    authLog.info("[ForgotPasswordScreen] mounted");
    return () => {
      authLog.info("[ForgotPasswordScreen] unmounted");
    };
  }, []);

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
      <SecondaryButton
        onPress={() => {
          authLog.info("[Navigation] goBack triggered from ForgotPassword");
          router.back();
        }}
      >
        Back
      </SecondaryButton>
    </View>
  );
};

export default ForgotPasswordScreen;
