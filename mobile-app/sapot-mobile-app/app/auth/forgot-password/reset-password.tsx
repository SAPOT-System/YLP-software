import { AUTH_ROUTES } from "@/config/routes";
import {
    AuthTextInput,
    PasswordRequirements,
    PrimaryButton,
    SecondaryButton,
    StepDots,
    useChangePassword,
    usePasswordResetKeyRecovery,
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
  const { token, identifier, method } = useLocalSearchParams<{
    token: string;
    identifier: string;
    method: string;
  }>();

  const [tokenValue, setTokenValue] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [methodValue, setMethodValue] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const [recoverySalt, setRecoverySalt] = useState("");

  const changePasswordResult = useChangePassword(tokenValue);
  const { userId } = changePasswordResult ?? {};
  const { attemptBuildWrappedBlob } = usePasswordResetKeyRecovery({
    identifier: identifierValue,
    method: methodValue,
    recoveryToken: recoveryToken || undefined,
    secret: recoverySecret || undefined,
    salt: recoverySalt || undefined,
    userId: userId ?? null,
  });

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
      const methodParam = normalizeParam(method);

      if (tokenParam) {
        setTokenValue(tokenParam);
        await setItemAsync("reset_password_token", tokenParam);
      } else {
        const stored = await getItemAsync("reset_password_token");
        if (stored) setTokenValue(stored);
      }

      if (identifierParam) {
        setIdentifierValue(identifierParam);
        await setItemAsync("reset_password_identifier", identifierParam);
      } else {
        const stored = await getItemAsync("reset_password_identifier");
        if (stored) setIdentifierValue(stored);
      }

      if (methodParam) {
        setMethodValue(methodParam);
        await setItemAsync("reset_password_method", methodParam);
      } else {
        const stored = await getItemAsync("reset_password_method");
        if (stored) setMethodValue(stored);
      }

      // Recovery fields are written by verification screens, only read here
      const storedRecoveryToken = await getItemAsync("reset_recovery_token");
      if (storedRecoveryToken) setRecoveryToken(storedRecoveryToken);

      const storedSecret = await getItemAsync("reset_recovery_secret");
      if (storedSecret) setRecoverySecret(storedSecret);

      const storedSalt = await getItemAsync("reset_recovery_salt");
      if (storedSalt) setRecoverySalt(storedSalt);
    };

    hydrateFromStorage();
  }, [token, identifier, method]);

  useEffect(() => {
    authLog.debug("[ChangePasswordScreen] state updated", {
      hasToken: Boolean(tokenValue),
      method: methodValue,
      hasRecoveryToken: Boolean(recoveryToken),
    });
  }, [tokenValue, methodValue, recoveryToken]);

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

    // Best-effort key recovery before password reset.
    // Null if recovery unavailable (no token, wrong secret, legacy V1 blob).
    const wrappedBlob = await attemptBuildWrappedBlob({ newPassword: password });

    const res = await changePassword({
      password,
      confirmPassword,
      identifier: identifierValue,
      wrappedBlob: wrappedBlob ?? undefined,
    });

    if (res.success) {
      await Promise.all([
        deleteItemAsync("reset_password_token"),
        deleteItemAsync("reset_password_identifier"),
        deleteItemAsync("reset_password_method"),
        deleteItemAsync("reset_recovery_token"),
        deleteItemAsync("reset_recovery_secret"),
        deleteItemAsync("reset_recovery_salt"),
      ]);
      authLog.info("[Navigation] Navigating to ResetSuccess", {
        screen: AUTH_ROUTES.FORGOT_PASSWORD.SUCCESS,
        keyRecoveryPerformed: Boolean(wrappedBlob),
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
