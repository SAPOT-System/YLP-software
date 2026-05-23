import { AUTH_ROUTES } from "@/config/routes";
import { SecondaryButton, StepDots, useEmailReset, useSmsReset } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { OTPInput } from "input-otp-native";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { HelperText, Text, useTheme } from "react-native-paper";

const CODE_LENGTH = 6;
const COUNTDOWN_SECONDS = 5 * 60;

const EnterRecoveryScreen = () => {
  const { identifier, method } = useLocalSearchParams<{
    identifier: string;
    method?: string;
  }>();
  const isSms = method === "sms";
  const emailReset = useEmailReset();
  const smsReset = useSmsReset();
  const { verifyCode, sendCode, error } = isSms ? smsReset : emailReset;
  const theme = useTheme();
  const [code, setCode] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number>(COUNTDOWN_SECONDS);
  const [isVerifying, setIsVerifying] = useState(false);
  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showError, hideToast } = useToast();

  useEffect(() => {
    authLog.info("[EnterRecoveryScreen] mounted");
    return () => {
      authLog.info("[EnterRecoveryScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timerId = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timerId);
  }, [secondsLeft]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleResend = async () => {
    authLog.debug("[EnterRecoveryScreen] handleResend called");
    const res = await sendCode(identifier);
    if (res.success) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      setCode("");
    } else {
      showError("Failed to resend code. Please try again.");
    }
  };

  const handleOnChange = async (newCode: string) => {
    setCode(newCode);

    if (newCode.length === CODE_LENGTH) {
      setIsVerifying(true);
      try {
        const res = await verifyCode(identifier, newCode);

        if (res.success && res.recoveryLink) {
          const token = res.recoveryLink.split("token=")[1];

          router.push({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
            params: {
              token: token,
              identifier: identifier,
            },
          });
        }
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const description = isSms
    ? `We've sent it to your phone ${identifier}`
    : `We've sent it to your email ${identifier}`;

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
      <ScreenHeader headerName="Resetting Password" />
      <StepDots total={3} current={2} />
      <ScreenContent title="Enter Recovery Code" description={description}>
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <OTPInput
          value={code}
          onChange={handleOnChange}
          maxLength={CODE_LENGTH}
          autoFocus
          containerStyle={{
            marginVertical: 20,
            flexDirection: "row",
            justifyContent: "center",
          }}
          render={({ slots }) => (
            <>
              {slots.map((slot, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderColor: slot.isActive
                      ? theme.colors.primary
                      : theme.colors.outline,
                    borderWidth: slot.isActive ? 2 : 1,
                    borderRadius: 8,
                    width: 44,
                    height: 56,
                    marginHorizontal: index === 2 ? 12 : 4,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      fontSize: 20,
                      fontWeight: "bold",
                    }}
                  >
                    {slot.char}
                  </Text>
                </View>
              ))}
            </>
          )}
        />
        <View style={{ alignItems: "center", gap: 6, marginTop: 8 }}>
          <Text
            variant="bodySmall"
            style={{
              color:
                secondsLeft <= 60
                  ? theme.colors.error
                  : theme.colors.onSurfaceVariant,
              fontWeight: secondsLeft <= 60 ? "bold" : "normal",
            }}
          >
            Code expires in{" "}
            <Text variant="bodySmall" style={{ fontWeight: "bold" }}>
              {formatTime(secondsLeft)}
            </Text>
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Didn't receive a code?{" "}
            <Text
              variant="labelLarge"
              style={{
                color:
                  secondsLeft === 0
                    ? theme.colors.primary
                    : theme.colors.outline,
                textDecorationLine: secondsLeft === 0 ? "underline" : "none",
              }}
              onPress={secondsLeft === 0 ? handleResend : undefined}
            >
              Resend
            </Text>
          </Text>
        </View>
        <SecondaryButton
          style={{ marginTop: 24 }}
          onPress={() => {
            authLog.info("[Navigation] goBack triggered from EnterRecovery");
            router.back();
          }}
        >
          Back
        </SecondaryButton>
      </ScreenContent>
      <LoadingOverlay visible={isVerifying} text="Verifying…" />
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </View>
    </KeyboardAwareScrollView>
  );
};

export default EnterRecoveryScreen;
