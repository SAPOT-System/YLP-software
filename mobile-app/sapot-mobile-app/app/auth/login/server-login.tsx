import { AUTH_ROUTES } from "@/app/routes";
import { AuthTextInput, PrimaryButton, useAuth } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import {
  ActivityIndicator,
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

  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { login, loading, errors } = auth;

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  // Handle general errors
  useEffect(() => {
    if (errors.general) {
      showToast(errors.general);
    }
  }, [errors.general]);

  const handleLogin = async () => {
    const result = await login({ username, password });

    if (result.success) {
      console.log("login successful");
      showToast("Login successful!");
      setTimeout(() => {
        router.replace("/(drawer)/(tabs)");
      }, 1000);
    } else {
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
        <Link href={AUTH_ROUTES.LOGIN.LAN_LOGIN} asChild>
          <Button mode="text" style={{ width: 280 }}>
            <Text
              style={{
                textDecorationLine: "underline",
                color: theme.colors.inverseOnSurface,
              }}
            >
              Use LAN mode
            </Text>
          </Button>
        </Link>
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
