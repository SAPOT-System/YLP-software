import { AUTH_ROUTES } from "@/config/routes";
import {
  AuthTextInput,
  PrimaryButton,
  SecondaryButton,
  useEmailReset,
  useValidateIdentifier,
} from "@/features/auth";
import { canResetPasswordApi } from "@/features/auth/api/auth.api";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { useToast } from "@/features/shared/hooks";
import { checkBackEndHealth } from "@/features/shared/api";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { HelperText, Snackbar } from "react-native-paper";

const EnterIdentifierScreen = () => {
  const {
    resetOption,
  }: { resetOption: "email" | "sms" | "question" | "recoveryKey" } =
    useLocalSearchParams();

  const { loading, error, validateIdentfier } = useValidateIdentifier();
  const {
    isLoading: emailResetLoading,
    error: emailResetError,
    sendCode,
  } = useEmailReset();
  const { visible: toastVisible, message: toastMessage, showToast, hideToast } = useToast();
  const [identifier, setIdentfier] = useState("");
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [storedIdentifier, setStoredIdentifier] =
    useState<string | null>(null);
  const [hasCheckedStoredToken, setHasCheckedStoredToken] = useState(false);

  useEffect(() => {
    authLog.info("[EnterIdentifierScreen] mounted");
    return () => {
      authLog.info("[EnterIdentifierScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    authLog.debug("[EnterIdentifierScreen] useEffect triggered, deps:", {
      resetOption,
      identifierLength: identifier.length,
    });
  }, [resetOption, identifier]);

  useEffect(() => {
    const loadStoredReset = async () => {
      try {
        const tokenValue = await getItemAsync("reset_password_token");
        const identifierValue = await getItemAsync(
          "reset_password_identifier"
        );
        setStoredToken(tokenValue);
        setStoredIdentifier(identifierValue);
      } catch (error) {
        authLog.error("[EnterIdentifierScreen] Error in load stored reset", {
          error,
        });
        setStoredToken(null);
        setStoredIdentifier(null);
      } finally {
        setHasCheckedStoredToken(false);
      }
    };

    loadStoredReset();
  }, []);

  const handleContinue = async () => {
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }
    authLog.debug("[EnterIdentifierScreen] handleContinue called", {
      identifierLength: identifier.length,
      resetOption,
    });
    const result = await validateIdentfier(identifier);

    if (result.success) {
      if (
        !hasCheckedStoredToken &&
        storedToken &&
        storedIdentifier &&
        identifier === storedIdentifier
      ) {
        setHasCheckedStoredToken(true);

        try {
          const isValid = await canResetPasswordApi(storedToken);

          if (isValid) {
            authLog.info("[Navigation] Navigating to ResetPassword", {
              screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
            });
            router.replace({
              pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
              params: { token: storedToken, identifier: storedIdentifier },
            });
            return;
          }

          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
          setStoredToken(null);
          setStoredIdentifier(null);
        } catch (error) {
          authLog.error(
            "[EnterIdentifierScreen] Error in validate stored token",
            { error }
          );
          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
          setStoredToken(null);
          setStoredIdentifier(null);
        }
      }

      if (resetOption === "question") {
        authLog.info("[Navigation] Navigating to QuestionReset", {
          screen: AUTH_ROUTES.FORGOT_PASSWORD.QUESTION_RESET,
        });
        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.QUESTION_RESET,
          params: { identifier },
        });

      }

      if (resetOption === "recoveryKey") {
        authLog.info("[Navigation] Navigating to RecoveryKeyReset", {
          screen: AUTH_ROUTES.FORGOT_PASSWORD.RECOVERY_KEY_RESET,
        });
        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.RECOVERY_KEY_RESET,
          params: { identifier },
        });

      }

      if (resetOption === "email") {
        const res = await sendCode(identifier);
        if (res.success) {
          authLog.info("[Navigation] Navigating to EnterRecovery", {
            screen: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
          });
          router.push({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
            params: { identifier },
          });
        }
      }
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
        <ScreenHeader headerName="Resetting Password" />
        <ScreenContent
          title="Forgot Password"
          description="Enter your account details"
        >
          <View style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}>
            {(error.general || emailResetError) && (
              <HelperText type="error" visible>
                {error.general || emailResetError}
              </HelperText>
            )}
            <AuthTextInput
              label="Email/Phone number/Username"
              placeholder="Enter identifier"
              value={identifier}
              onChangeText={setIdentfier}
              error={!!error.identifier}
            />
            {error.identifier && (
              <HelperText type="error" visible>
                {error.identifier}
              </HelperText>
            )}
          </View>
          <PrimaryButton
            style={{ marginBottom: 8 }}
            onPress={handleContinue}
            loading={loading || emailResetLoading}
            disabled={loading || emailResetLoading}
          >
            Continue
          </PrimaryButton>
          <SecondaryButton
            onPress={() => {
              authLog.info("[Navigation] goBack triggered from EnterIdentifier");
              router.back();
            }}
            disabled={loading || emailResetLoading}
          >
            Back
          </SecondaryButton>
        </ScreenContent>
      </View>
      <Snackbar visible={toastVisible} onDismiss={hideToast} duration={3000}>
        {toastMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

export default EnterIdentifierScreen;
