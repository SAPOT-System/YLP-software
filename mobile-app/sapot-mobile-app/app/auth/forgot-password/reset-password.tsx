import { AUTH_ROUTES } from "@/config/routes";
import {
    AuthTextInput,
    PasswordRequirements,
    PrimaryButton,
    SecondaryButton,
    StepDots,
    useChangePassword,
} from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import {
    deleteItemAsync,
    getItemAsync,
    setItemAsync,
} from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { HelperText } from "react-native-paper";

const ChangePasswordScreen = () => {
  const { token, identifier } = useLocalSearchParams<{
    token: string;
    identifier: string;
  }>();
  const [tokenValue, setTokenValue] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const changePasswordResult = useChangePassword(tokenValue);
  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showError,
    hideToast,
  } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    authLog.info("[ChangePasswordScreen] mounted");
    return () => {
      authLog.info("[ChangePasswordScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    const normalizeParam = (value?: string | string[]) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";

    const hydrateFromStorage = async () => {
      const tokenParam = normalizeParam(token);
      const identifierParam = normalizeParam(identifier);

      if (tokenParam) {
        setTokenValue(tokenParam);
        await setItemAsync("reset_password_token", tokenParam);
      } else {
        const storedToken = await getItemAsync("reset_password_token");
        if (storedToken) setTokenValue(storedToken);
      }

      if (identifierParam) {
        setIdentifierValue(identifierParam);
        await setItemAsync("reset_password_identifier", identifierParam);
      } else {
        const storedIdentifier = await getItemAsync("reset_password_identifier");
        if (storedIdentifier) setIdentifierValue(storedIdentifier);
      }
    };

    hydrateFromStorage();
  }, [token, identifier]);

  useEffect(() => {
    authLog.debug("[ChangePasswordScreen] useEffect triggered, deps:", {
      hasToken: Boolean(tokenValue),
      identifierLength: identifierValue.length,
    });
  }, [tokenValue, identifierValue]);

  if (!changePasswordResult) {
    return (
      <View style={{ flex: 1 }}>
        <LoadingOverlay visible />
      </View>
    );
  }

  const { changePassword, loading, errors, isTokenValid } = changePasswordResult;

  if (isTokenValid === null) {
    return (
      <View style={{ flex: 1 }}>
        <LoadingOverlay visible />
      </View>
    );
  }

  if (isTokenValid === false) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}>
        <ScreenHeader headerName="Resetting Password" />
        <ScreenContent
          title="Link Expired"
          description="Your password reset link is invalid or has expired. Please start the process again."
        >
          <SecondaryButton
            onPress={() => {
              authLog.info("[Navigation] goBack from expired token");
              router.replace(AUTH_ROUTES.FORGOT_PASSWORD.INDEX);
            }}
          >
            Start Over
          </SecondaryButton>
        </ScreenContent>
      </View>
    );
  }

  const handleChangePassword = async () => {
    authLog.debug("[ChangePasswordScreen] handleChangePassword called", {
      password: "[REDACTED]",
      confirmPassword: "[REDACTED]",
    });
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showError("Cannot reach server. Please check your connection.");
      return;
    }
    const res = await changePassword({
      password,
      confirmPassword,
      identifier: identifierValue,
    });
    if (res.success) {
      await deleteItemAsync("reset_password_token");
      await deleteItemAsync("reset_password_identifier");
      authLog.info("[Navigation] Navigating to ResetSuccess", {
        screen: AUTH_ROUTES.FORGOT_PASSWORD.SUCCESS,
      });
      router.replace(AUTH_ROUTES.FORGOT_PASSWORD.SUCCESS);
    } else {
      showError(errors.general || errors.password || "Failed to change password. Please try again.");
      authLog.warn("[ChangePasswordScreen] change password failed");
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
        <ScreenHeader headerName="Change Password" />
        <StepDots total={3} current={3} />
        <ScreenContent
          title="Change your password"
          description="Please enter your new password"
        >
          <View
            style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
          >
            <AuthTextInput
              label="New password"
              placeholder="Enter your new password"
              value={password}
              onChangeText={setPassword}
              style={styles.textInput}
              secureTextEntry
              error={!!errors.password}
            />
            {errors.password && (
              <HelperText type="error" style={styles.helperText}>
                {errors.password}
              </HelperText>
            )}
            <PasswordRequirements password={password} />
            <AuthTextInput
              label="Confirm password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.textInput}
              secureTextEntry
              error={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <HelperText type="error" style={styles.helperText}>
                {errors.confirmPassword}
              </HelperText>
            )}
          </View>
          <PrimaryButton
            onPress={handleChangePassword}
            loading={loading}
            disabled={loading}
          >
            Set New Password
          </PrimaryButton>
          <SecondaryButton
            style={{ marginTop: 8 }}
            onPress={() => {
              authLog.info("[Navigation] goBack triggered from ChangePassword");
              router.back();
            }}
            disabled={loading}
          >
            Back
          </SecondaryButton>
        </ScreenContent>
        <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
          {toastMessage}
        </AppSnackbar>
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  textInput: {
    marginBottom: 4,
  },
  helperText: {
    marginBottom: 8,
  },
});

export default ChangePasswordScreen;
