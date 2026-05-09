import { ResetOption, SecondaryButton } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { authLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { ScrollView, View } from "react-native";

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
        <ScrollView
          style={{ width: "100%" }}
          contentContainerStyle={{ paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <ResetOption option="email" />
          <ResetOption option="sms" />
          <ResetOption option="question" />
          <ResetOption option="recoveryKey" />
        </ScrollView>
        <SecondaryButton
          onPress={() => {
            authLog.info("[Navigation] goBack triggered from ForgotPassword");
            router.back();
          }}
        >
          Back
        </SecondaryButton>
      </ScreenContent>
    </View>
  );
};

export default ForgotPasswordScreen;
