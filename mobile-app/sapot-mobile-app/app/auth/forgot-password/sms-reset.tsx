import { AUTH_ROUTES } from "@/app/routes";
import { AuthTextInput, PrimaryButton } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { authLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

const SmsResetScreen = () => {
  const [phone, setPhone] = useState("");

  useEffect(() => {
    authLog.info("[SmsResetScreen] mounted");
    return () => {
      authLog.info("[SmsResetScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    authLog.debug("[SmsResetScreen] useEffect triggered, deps:", {
      phoneLength: phone.length,
    });
  }, [phone]);

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
          onPress={() => {
            authLog.debug("[SmsResetScreen] onPress triggered");
            authLog.info("[Navigation] Navigating to EnterRecovery", {
              screen: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
            });
            router.push(AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY);
          }}
        >
          Send Code
        </PrimaryButton>
      </ScreenContent>
    </View>
  );
};

export default SmsResetScreen;
