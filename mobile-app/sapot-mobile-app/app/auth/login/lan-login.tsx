import { AuthTextInput, PrimaryButton, useAuth } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { useAppMode } from "@/features/shared/context";
import { authLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { HelperText } from "react-native-paper";

const LanLoginScreen = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const { loginAsGuest, errors } = useAuth();
  const { setMode } = useAppMode();

  useEffect(() => {
    authLog.info("[LanLoginScreen] mounted");
    return () => {
      authLog.info("[LanLoginScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    authLog.debug("[LanLoginScreen] useEffect triggered, deps:", {
      hasFirstName: Boolean(firstName.trim()),
      hasLastName: Boolean(lastName.trim()),
    });
  }, [firstName, lastName]);

  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    authLog.debug("[LanLoginScreen] handleLogin called", {
      hasFirstName: Boolean(firstName.trim()),
      hasLastName: Boolean(lastName.trim()),
    });
    setLoading(true);
    try {
      const res = await loginAsGuest({ firstName, lastName });
      if (res.success) {
        authLog.info("[LanLoginScreen] guest login success");
        setMode("lan");
        authLog.info("[Navigation] Navigating to Home", {
          screen: "/(drawer)/(tabs)",
        });
        router.replace("/(drawer)/(tabs)");
      } else {
        authLog.warn("[LanLoginScreen] guest login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
      >
        <ScreenHeader headerName="Login" />
        <ScreenContent
          title="Welcome to SAPOT!"
          description="Enter your name to continue as guest"
        >
          <View
            style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
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
          <PrimaryButton onPress={handleLogin} loading={loading} disabled={loading}>
            Login
          </PrimaryButton>
        </ScreenContent>
      </View>
    </KeyboardAvoidingView>
  );
};

export default LanLoginScreen;
