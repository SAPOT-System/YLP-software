import { View } from "react-native";
import React from "react";
import {
  ScreenContent,
  ScreenHeader,
} from "@/features/getting-started";
import { ResetOption } from "@/features/auth";

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
        </View>
      </ScreenContent>
    </View>
  );
};

export default ForgotPasswordScreen;
