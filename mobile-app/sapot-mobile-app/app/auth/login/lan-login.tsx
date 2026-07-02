import { AuthTextInput, PrimaryButton, useAuth } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useAppMode } from "@/features/shared/core/context";
import { authLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { HelperText } from "react-native-paper";

const LOGIN_TIMEOUT_MS = 30_000;

type OverlayPhase = "idle" | "loading" | "success" | "error";

const LanLoginScreen = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [overlayMessage, setOverlayMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { loginAsGuest, errors } = useAuth();
  const { setMode } = useAppMode();

  useEffect(() => {
    authLog.info("[LanLoginScreen] mounted");
    return () => {
      authLog.info("[LanLoginScreen] unmounted");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleOverlayDismiss = useCallback(() => {
    if (overlayPhase === "success") {
      router.replace("/(drawer)/(tabs)");
    }
    setOverlayPhase("idle");
    setOverlayMessage("");
  }, [overlayPhase]);

  const handleLogin = async () => {
    authLog.debug("[LanLoginScreen] handleLogin called", {
      hasFirstName: Boolean(firstName.trim()),
      hasLastName: Boolean(lastName.trim()),
    });

    setOverlayPhase("loading");
    setOverlayMessage("");

    timeoutRef.current = setTimeout(() => {
      authLog.warn("[LanLoginScreen] login timed out");
      setOverlayPhase("error");
      setOverlayMessage("Login timed out. Please try again.");
    }, LOGIN_TIMEOUT_MS);

    try {
      const res = await loginAsGuest({ firstName, lastName });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (res.success) {
        authLog.info("[LanLoginScreen] guest login success");
        setMode("lan");
        setOverlayPhase("success");
        setOverlayMessage("Logged in!");
      } else {
        authLog.warn("[LanLoginScreen] guest login failed");
        setOverlayPhase("error");
        setOverlayMessage("Please check your name and try again.");
      }
    } catch {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOverlayPhase("error");
      setOverlayMessage("An unexpected error occurred.");
    }
  };

  const isSubmitting = overlayPhase !== "idle";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <LoadingOverlay
        visible={isSubmitting}
        text="Logging in..."
        status={overlayPhase !== "idle" ? overlayPhase : "loading"}
        statusMessage={overlayMessage}
        onDismiss={handleOverlayDismiss}
      />
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
              autoCapitalize="words"
              autoCorrect={false}
            />
            <HelperText type="error" visible={!!errors.firstName}>
              {errors.firstName}
            </HelperText>
            <AuthTextInput
              label="Last Name"
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <HelperText type="error" visible={!!errors.lastName}>
              {errors.lastName}
            </HelperText>
          </View>
          <PrimaryButton
            onPress={handleLogin}
            loading={overlayPhase === "loading"}
            disabled={isSubmitting}
          >
            Login
          </PrimaryButton>
        </ScreenContent>
      </View>
    </KeyboardAvoidingView>
  );
};

export default LanLoginScreen;
