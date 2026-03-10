import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { router } from "expo-router";
import { AUTH_ROUTES } from "@/app/routes";
import { AuthTextInput, PrimaryButton } from "@/features/auth";

const SmsResetScreen = () => {
  const [phone, setPhone] = useState("");
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Password Recovery"
        description="We will send a password recovery code to this phone number"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          {/* TODO: implement error mechanism */}
          <AuthTextInput
            mode="outlined"
            label="Phone Number"
            placeholder="+63"
            value={phone}
            onChangeText={setPhone}
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

export default SmsResetScreen;
