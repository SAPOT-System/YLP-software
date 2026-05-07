import { AUTH_ROUTES } from "@/config/routes";
import { AuthTextInput, PrimaryButton, SecondaryButton, useAuth } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { useAppMode } from "@/features/shared/context";
import { checkBackEndHealth } from "@/features/shared/api";
import { authLog } from "@/features/shared/utils/logger";
import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import {
  HelperText,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";

const ServerLoginScreen = () => {
  const theme = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const { login, loading, errors } = useAuth();
  const { mode, setMode } = useAppMode();

  useEffect(() => {
    authLog.info("[ServerLoginScreen] mounted");
    return () => {
      authLog.info("[ServerLoginScreen] unmounted");
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  // Handle general errors
  useEffect(() => {
    authLog.debug("[ServerLoginScreen] useEffect triggered, deps:", {
      hasUsername: Boolean(username.trim()),
      hasPassword: Boolean(password),
      mode,
    });
  }, [username, password, mode]);

  // Handle general errors
  useEffect(() => {
    if (errors.general) {
      authLog.warn("[ServerLoginScreen] general error", {
        message: errors.general,
      });
      showToast(errors.general);
    }
  }, [errors.general]);

  const handleLogin = async () => {
    authLog.debug("[ServerLoginScreen] handleLogin called", {
      hasUsername: Boolean(username.trim()),
      password: "[REDACTED]",
    });
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }
    const result = await login({ username, password });

    if (result.success) {
      authLog.info("auth › login success");
      showToast("Login successful!");
      if (mode !== "auto") {
        setMode("server");
      }
      setTimeout(() => {
        authLog.info("[Navigation] Navigating to Home", {
          screen: "/(drawer)/(tabs)",
        });
        router.replace("/(drawer)/(tabs)");
      }, 1000);
    } else {
      authLog.warn("auth › login failed");
      showToast("Login failed");
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      bounces={false}
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
      >
        <ScreenHeader headerName="Login" />
        <ScreenContent
          title="Welcome back"
          description="Please login to continue"
        >
          <View
            style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
          >
            <AuthTextInput
              label="Username"
              placeholder="Username"
              value={username}
              onChangeText={setUsername}
              error={!!errors.username}
            />
            <HelperText type="error" visible={!!errors.username}>
              {errors.username}
            </HelperText>
            <AuthTextInput
              label="Password"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={!!errors.password}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              <HelperText type="error" visible={!!errors.password}>
                {errors.password}
              </HelperText>
              <Link href={AUTH_ROUTES.FORGOT_PASSWORD.INDEX} asChild>
                <Text
                  variant="labelLarge"
                  style={{
                    textDecorationLine: "underline",
                    textAlign: "right",
                    color: theme.colors.primary,
                  }}
                >
                  Forgot password?
                </Text>
              </Link>
            </View>
          </View>

          <PrimaryButton
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </PrimaryButton>
          <SecondaryButton
            onPress={() => {
              authLog.debug("[ServerLoginScreen] onPress triggered");
              setMode("lan");
              authLog.info("[Navigation] Navigating to LanLogin", {
                screen: AUTH_ROUTES.LOGIN.LAN_LOGIN,
              });
              router.push(AUTH_ROUTES.LOGIN.LAN_LOGIN);
            }}
          >
            Use LAN mode
          </SecondaryButton>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Don't have an account?{" "}
            <Link
              href={AUTH_ROUTES.REGISTER}
              style={{
                textDecorationLine: "underline",
                color: theme.colors.primary,
              }}
            >
              Register here
            </Link>
          </Text>
        </ScreenContent>
        <Snackbar
          visible={toastVisible}
          onDismiss={() => setToastVisible(false)}
          duration={3000}
        >
          {toastMessage}
        </Snackbar>
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ServerLoginScreen;
