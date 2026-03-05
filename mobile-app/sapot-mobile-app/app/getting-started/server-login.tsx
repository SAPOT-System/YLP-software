import { useAuth } from "@/features/auth";
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
  TextInput,
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
      showToast("Login successful!");
      setTimeout(() => {
        router.replace("/(drawer)/(tabs)");
      }, 1000);
    }
  };

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Login" />
      <ScreenContent
        title="Welcome to SAPOT!"
        description="Please login to continue"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          <TextInput
            mode="outlined"
            label="Username"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={{ marginBottom: 4 }}
            error={!!errors.username}
          />
          <HelperText type="error" visible={!!errors.username}>
            {errors.username}
          </HelperText>
          <TextInput
            mode="outlined"
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={{ marginBottom: 4 }}
            error={!!errors.password}
          />
          <HelperText type="error" visible={!!errors.password}>
            {errors.password}
          </HelperText>
          {/* TODO: screen for forgot password */}
          <Link href="/getting-started/forgot-password" asChild>
            <Text
              variant="bodyMedium"
              style={{
                textDecorationLine: "underline",
                fontWeight: "bold",
                color: theme.colors.onPrimaryContainer,
                textAlign: "right",
              }}
            >
              Forgot password?
            </Text>
          </Link>
        </View>
        <Button
          onPress={handleLogin}
          mode="contained"
          loading={loading}
          disabled={loading}
          style={{ width: 280, marginBottom: 8 }}
        >
          {loading ? "Logging in..." : "Login"}
        </Button>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onPrimaryContainer }}
        >
          Don't have an account?{" "}
          <Link
            href="/getting-started/register"
            style={{ textDecorationLine: "underline", fontWeight: "bold" }}
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
