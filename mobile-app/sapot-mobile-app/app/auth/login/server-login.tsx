import { AUTH_ROUTES } from "@/config/routes";
import { AuthTextInput, PrimaryButton, SecondaryButton, useAuth } from "@/features/auth";
import { AttemptsWarning } from "@/features/auth/components/attempts-warning";
import { LockoutBanner } from "@/features/auth/components/lockout-banner";
import { useLockoutTimer } from "@/features/auth/hooks/use-lockout-timer";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useAppMode } from "@/features/shared/context";
import { authLog } from "@/features/shared/utils/logger";
import { Link, router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { HelperText, Text, useTheme } from "react-native-paper";

const LOGIN_TIMEOUT_MS = 30_000;

type OverlayPhase = "idle" | "loading" | "success" | "error";

const ServerLoginScreen = () => {
  const theme = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [overlayMessage, setOverlayMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { login, errors } = useAuth();
  const { mode, setMode } = useAppMode();
  const lockoutTimer = useLockoutTimer("lockout_login");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  useEffect(() => {
    authLog.info("[ServerLoginScreen] mounted");
    return () => {
      authLog.info("[ServerLoginScreen] unmounted");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleOverlayDismiss = useCallback(() => {
    if (overlayPhase === "success") {
      // Explicit navigation here (rather than relying on the isAuthenticated
      // redirect in getting-started/_layout.tsx) ensures the success overlay
      // finishes showing before the user is taken to HOME.
      router.replace("/(drawer)/(tabs)");
    }
    setOverlayPhase("idle");
    setOverlayMessage("");
  }, [overlayPhase]);

  const handleLogin = async () => {
    authLog.debug("[ServerLoginScreen] handleLogin called", {
      hasUsername: Boolean(username.trim()),
      password: "[REDACTED]",
    });

    const reachable = await checkBackEndHealth();
    if (!reachable) {
      setOverlayPhase("error");
      setOverlayMessage("Cannot reach server. Please check your connection.");
      return;
    }

    setOverlayPhase("loading");
    setOverlayMessage("");

    timeoutRef.current = setTimeout(() => {
      authLog.warn("[ServerLoginScreen] login timed out");
      setOverlayPhase("error");
      setOverlayMessage("Login timed out. Please try again.");
    }, LOGIN_TIMEOUT_MS);

    try {
      const result = await login({ username, password });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (result.success) {
        authLog.info("auth › login success");
        if (mode !== "auto") setMode("server");
        setAttemptsRemaining(null);
        setOverlayPhase("success");
        setOverlayMessage("Login successful!");
      } else if (result.lockout) {
        await lockoutTimer.setLock(
          result.lockout.lockedUntil,
          result.lockout.deviceType,
          result.lockout.attemptsRemaining
        );
        setAttemptsRemaining(null);
        setOverlayPhase("idle");
      } else {
        authLog.warn("auth › login failed");
        setAttemptsRemaining(result.attemptsRemaining ?? null);
        setOverlayPhase("error");
        setOverlayMessage("Login failed. Please check your credentials.");
      }
    } catch {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOverlayPhase("error");
      setOverlayMessage("An unexpected error occurred.");
    }
  };

  const isSubmitting = overlayPhase !== "idle";
  const isDisabled = isSubmitting || lockoutTimer.isLocked;

  return (
    <View style={{ flex: 1 }}>
      <LoadingOverlay
        visible={isSubmitting}
        text="Logging in..."
        status={overlayPhase !== "idle" ? overlayPhase : "loading"}
        statusMessage={overlayMessage}
        onDismiss={handleOverlayDismiss}
      />
      <ScreenHeader headerName="Login" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <ScreenContent title="Welcome back" description="Please login to continue">
          {lockoutTimer.isLocked && (
            <LockoutBanner
              secondsRemaining={lockoutTimer.secondsRemaining}
              deviceType={lockoutTimer.deviceType}
              onExpire={lockoutTimer.clearLock}
            />
          )}
          {!lockoutTimer.isLocked && attemptsRemaining !== null && (
            <AttemptsWarning attemptsRemaining={attemptsRemaining} />
          )}
          <View style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}>
            <AuthTextInput
              label="Username"
              placeholder="Username"
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase())}
              error={!!errors.username}
              autoCapitalize="none"
              autoCorrect={false}
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
            loading={overlayPhase === "loading"}
            disabled={isDisabled}
          >
            {overlayPhase === "loading" ? "Logging in..." : "Login"}
          </PrimaryButton>
          <SecondaryButton
            onPress={() => {
              authLog.debug("[ServerLoginScreen] onPress triggered");
              setMode("lan");
              router.push(AUTH_ROUTES.LOGIN.LAN_LOGIN);
            }}
          >
            Use LAN mode
          </SecondaryButton>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Don't have an account?{" "}
            <Link
              href={AUTH_ROUTES.REGISTER}
              style={{ textDecorationLine: "underline", color: theme.colors.primary }}
            >
              Register here
            </Link>
          </Text>
        </ScreenContent>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default ServerLoginScreen;
