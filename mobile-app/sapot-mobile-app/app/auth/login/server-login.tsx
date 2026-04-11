import { AUTH_ROUTES } from "@/app/routes";
import { AuthTextInput, PrimaryButton, useAuth } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { useAppMode } from "@/features/shared/context";
import { authLog } from "@/features/shared/utils/logger";
import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import {
  Button,
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
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Login" />
      <ScreenContent
        title="Welcome back"
        description="Please login to continue"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 28 }}
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
                variant="bodyMedium"
                style={{
                  textDecorationLine: "underline",
                  textAlign: "right",
                  textDecorationColor: theme.colors.inverseOnSurface,
                  color: theme.colors.inverseOnSurface,
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
          style={{
            width: 280,
            height: 52,
            borderRadius: 30,
            justifyContent: "center",
          }}
        >
          {loading ? "Logging in..." : "Login"}
        </PrimaryButton>
        <Button
          mode="text"
          style={{ width: 280 }}
          onPress={() => {
            authLog.debug("[ServerLoginScreen] onPress triggered");
            setMode("lan");
            authLog.info("[Navigation] Navigating to LanLogin", {
              screen: AUTH_ROUTES.LOGIN.LAN_LOGIN,
            });
            router.push(AUTH_ROUTES.LOGIN.LAN_LOGIN);
          }}
        >
          <Text
            style={{
              textDecorationLine: "underline",
              color: theme.colors.inverseOnSurface,
            }}
          >
            Use LAN mode
          </Text>
        </Button>
        <Text variant="bodyMedium">
          Don't have an account?{" "}
          <Link
            href={AUTH_ROUTES.REGISTER}
            style={{
              textDecorationLine: "underline",
              color: theme.colors.inverseOnSurface,
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
  );
};

export default ServerLoginScreen;
