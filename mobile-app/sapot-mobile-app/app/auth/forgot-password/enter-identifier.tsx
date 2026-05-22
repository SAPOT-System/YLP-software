import { AUTH_ROUTES } from "@/config/routes";
import {
  AuthTextInput,
  PrimaryButton,
  SecondaryButton,
  StepDots,
  useEmailReset,
  useSmsReset,
  useValidateIdentifier,
} from "@/features/auth";
import { canResetPasswordApi } from "@/features/auth/api/auth.api";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { HelperText } from "react-native-paper";

const PHONE_REGEX = /^\+639\d{9}$/;

const inputConfig = {
  email: {
    label: "Email address",
    placeholder: "Enter your email",
    keyboardType: "email-address" as const,
  },
  sms: {
    label: "Phone number",
    placeholder: "+639XXXXXXXXX",
    keyboardType: "phone-pad" as const,
  },
  question: {
    label: "Email / Phone / Username",
    placeholder: "Enter identifier",
    keyboardType: "default" as const,
  },
  recoveryKey: {
    label: "Email / Phone / Username",
    placeholder: "Enter identifier",
    keyboardType: "default" as const,
  },
};

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
  const {
    isLoading: smsResetLoading,
    error: smsResetError,
    sendCode: sendSmsCode,
  } = useSmsReset();
  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showError, hideToast } = useToast();
  const [identifier, setIdentfier] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [storedIdentifier, setStoredIdentifier] = useState<string | null>(null);
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
        const identifierValue = await getItemAsync("reset_password_identifier");
        setStoredToken(tokenValue);
        setStoredIdentifier(identifierValue);
      } catch (error) {
        authLog.error("[EnterIdentifierScreen] Error in load stored reset", { error });
        setStoredToken(null);
        setStoredIdentifier(null);
      } finally {
        setHasCheckedStoredToken(false);
      }
    };

    loadStoredReset();
  }, []);

  const isSending = emailResetLoading || smsResetLoading;
  const isLoading = loading || isSending;
  const config = inputConfig[resetOption] ?? inputConfig.question;

  const handleContinue = async () => {
    if (resetOption === "sms" && !PHONE_REGEX.test(identifier.trim())) {
      setPhoneError("Enter a valid Philippine number: +639XXXXXXXXX");
      return;
    }
    setPhoneError(null);

    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showError("Cannot reach server. Please check your connection.");
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
          authLog.error("[EnterIdentifierScreen] Error in validate stored token", { error });
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
          router.replace({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
            params: { identifier },
          });
        }
      }

      if (resetOption === "sms") {
        const res = await sendSmsCode(identifier);
        if (res.success) {
          authLog.info("[Navigation] Navigating to EnterRecovery (sms)", {
            screen: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
          });
          router.replace({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
            params: { identifier, method: "sms" },
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
        <StepDots total={3} current={1} />
        <ScreenContent
          title="Forgot Password"
          description="Enter your account details"
        >
          <View style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}>
            {(error.general || emailResetError || smsResetError) && (
              <HelperText type="error" visible>
                {error.general || emailResetError || smsResetError}
              </HelperText>
            )}
            <AuthTextInput
              label={config.label}
              placeholder={config.placeholder}
              value={identifier}
              onChangeText={(text) => {
                setIdentfier(text);
                if (phoneError) setPhoneError(null);
              }}
              keyboardType={config.keyboardType}
              error={!!error.identifier || !!phoneError}
            />
            {(error.identifier || phoneError) && (
              <HelperText type="error" visible>
                {error.identifier || phoneError}
              </HelperText>
            )}
          </View>
          <PrimaryButton
            style={{ marginBottom: 8 }}
            onPress={handleContinue}
            loading={isLoading}
            disabled={isLoading}
          >
            {isSending ? "Sending…" : "Continue"}
          </PrimaryButton>
          <SecondaryButton
            onPress={() => {
              authLog.info("[Navigation] goBack triggered from EnterIdentifier");
              router.back();
            }}
            disabled={isLoading}
          >
            Back
          </SecondaryButton>
        </ScreenContent>
      </View>
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </KeyboardAvoidingView>
  );
};

export default EnterIdentifierScreen;
