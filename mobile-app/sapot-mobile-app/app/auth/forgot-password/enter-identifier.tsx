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
import { checkBackEndHealth } from "@/features/shared/core/api";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { authLog } from "@/features/shared/core/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { HelperText } from "react-native-paper";

const PHONE_REGEX = /^\+639\d{9}$/;

type OverlayPhase = "idle" | "loading" | "success" | "error";

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

  const { error, validateIdentfier } = useValidateIdentifier();
  const {
    isLoading: emailResetLoading,
    sendCode,
  } = useEmailReset();
  const {
    isLoading: smsResetLoading,
    sendCode: sendSmsCode,
  } = useSmsReset();
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [overlayMessage, setOverlayMessage] = useState("");
  const pendingNavRef = useRef<(() => void) | null>(null);
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
  const config = inputConfig[resetOption] ?? inputConfig.question;
  const isSubmitting = overlayPhase !== "idle";

  const handleOverlayDismiss = useCallback(() => {
    if (overlayPhase === "success" && pendingNavRef.current) {
      pendingNavRef.current();
    }
    setOverlayPhase("idle");
    setOverlayMessage("");
  }, [overlayPhase]);

  const handleContinue = async () => {
    if (resetOption === "sms" && !PHONE_REGEX.test(identifier.trim())) {
      setPhoneError("Enter a valid Philippine number: +639XXXXXXXXX");
      return;
    }
    setPhoneError(null);

    const reachable = await checkBackEndHealth();
    if (!reachable) {
      setOverlayPhase("error");
      setOverlayMessage("Cannot reach server. Please check your connection.");
      return;
    }

    setOverlayPhase("loading");
    setOverlayMessage("");

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
            pendingNavRef.current = () =>
              router.replace({
                pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
                params: { token: storedToken, identifier: storedIdentifier },
              });
            setOverlayPhase("success");
            setOverlayMessage("Continuing your reset session...");
            return;
          }

          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
          setStoredToken(null);
          setStoredIdentifier(null);
        } catch (err) {
          authLog.error("[EnterIdentifierScreen] Error in validate stored token", { err });
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
        pendingNavRef.current = () =>
          router.push({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.QUESTION_RESET,
            params: { identifier },
          });
        setOverlayPhase("success");
        setOverlayMessage("Identity verified!");
        return;
      }

      if (resetOption === "recoveryKey") {
        authLog.info("[Navigation] Navigating to RecoveryKeyReset", {
          screen: AUTH_ROUTES.FORGOT_PASSWORD.RECOVERY_KEY_RESET,
        });
        pendingNavRef.current = () =>
          router.push({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.RECOVERY_KEY_RESET,
            params: { identifier },
          });
        setOverlayPhase("success");
        setOverlayMessage("Identity verified!");
        return;
      }

      if (resetOption === "email") {
        const res = await sendCode(identifier);
        if (res.success) {
          authLog.info("[Navigation] Navigating to EnterRecovery", {
            screen: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
          });
          pendingNavRef.current = () =>
            router.replace({
              pathname: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
              params: { identifier },
            });
          setOverlayPhase("success");
          setOverlayMessage("Code sent to your email!");
          return;
        }
        setOverlayPhase("error");
        setOverlayMessage("Failed to send reset code. Please try again.");
        return;
      }

      if (resetOption === "sms") {
        const res = await sendSmsCode(identifier);
        if (res.success) {
          authLog.info("[Navigation] Navigating to EnterRecovery (sms)", {
            screen: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
          });
          pendingNavRef.current = () =>
            router.replace({
              pathname: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
              params: { identifier, method: "sms" },
            });
          setOverlayPhase("success");
          setOverlayMessage("Code sent to your phone!");
          return;
        }
        setOverlayPhase("error");
        setOverlayMessage("Failed to send reset code. Please try again.");
        return;
      }
    } else {
      setOverlayPhase("error");
      setOverlayMessage(
        error.general || "Identifier not found. Please check your details."
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LoadingOverlay
        visible={isSubmitting}
        text="Please wait…"
        status={overlayPhase !== "idle" ? overlayPhase : "loading"}
        statusMessage={overlayMessage}
        onDismiss={handleOverlayDismiss}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
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
              loading={overlayPhase === "loading"}
              disabled={isSubmitting}
            >
              {overlayPhase === "loading" ? "Please wait…" : isSending ? "Sending…" : "Continue"}
            </PrimaryButton>
            <SecondaryButton
              onPress={() => {
                authLog.info("[Navigation] goBack triggered from EnterIdentifier");
                router.back();
              }}
              disabled={isSubmitting}
            >
              Back
            </SecondaryButton>
          </ScreenContent>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default EnterIdentifierScreen;
