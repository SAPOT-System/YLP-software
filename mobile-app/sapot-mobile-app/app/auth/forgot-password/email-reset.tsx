import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { router } from "expo-router";
import { AUTH_ROUTES } from "@/app/routes";
import { AuthTextInput, PrimaryButton } from "@/features/auth";

const EmailResetScreen = () => {
  const [email, setEmail] = useState("");
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Password Recovery"
        description="We will send a password recovery code to this email address"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          {/* TODO: implement error mechanism */}
          <AuthTextInput
            label="Email Address"
            placeholder="yourmail@gmail.com"
            value={email}
            onChangeText={setEmail}
          />
        </View>
        <PrimaryButton
          onPress={() =>
            router.push(AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY)
          }
        >
          Send Code
        </PrimaryButton>
      </ScreenContent>
    </View>
  );
};

export default EmailResetScreen;
