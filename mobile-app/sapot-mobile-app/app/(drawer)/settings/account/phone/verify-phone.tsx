import { SETTINGS_ROUTES } from "@/config/routes";
import { useUserService } from "@/features/auth";
import {
  checkGsmHealth,
  requestPhoneVerification,
  resendVerificationCodePhone,
  verifyCodePhone,
} from "@/features/auth/api/auth.api";
import { toInternationalPhone } from "@/features/auth/utils/validation";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { VerificationCodeContent } from "@/features/settings";
import AppSnackbar from "@/features/shared/components/app-snackbar";
import { uiLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";

export default function VerifyPhone() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const theme = useTheme();
  const [isSending, setIsSending] = useState(true);
  const [sendFailed, setSendFailed] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: "neutral" | "error";
  }>({
    visible: false,
    message: "",
    variant: "neutral",
  });
  const userService = useUserService();
  const { setupPhoneBlob } = useRecoveryKeySetup();

  useEffect(() => {
    uiLog.info("[VerifyPhone] mounted");
    sendCode();
    return () => {
      uiLog.info("[VerifyPhone] unmounted");
    };
  }, []);

  const sendCode = async () => {
    setIsSending(true);
    setSendFailed(false);
    const gsmOnline = await checkGsmHealth();
    if (!gsmOnline) {
      setSnackbar({
        visible: true,
        message: "SMS service is currently unavailable. Please try again later.",
        variant: "error",
      });
      setSendFailed(true);
      setIsSending(false);
      return;
    }
    try {
      await requestPhoneVerification(
        phone ? toInternationalPhone(phone) : undefined
      );
      setCodeError(undefined);
    } catch (error) {
      uiLog.error("[VerifyPhone] Error requesting phone verification", { error });
      setSendFailed(true);
      setSnackbar({
        visible: true,
        message: "Failed to send verification code. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    if (!phone) {
      setCodeError("Phone number is missing.");
      return;
    }

    setCodeError(undefined);

    try {
      await verifyCodePhone(code);
      await userService.updateAuthenticatedUser({ phoneNumberVerified: true });
      await setupPhoneBlob(phone);
      uiLog.info("[VerifyPhone] phone verified, navigating to PhoneVerified");
      router.replace(SETTINGS_ROUTES.PHONE_VERIFIED);
    } catch (error) {
      uiLog.error("[VerifyPhone] Error verifying code", { error });
      setCodeError("Invalid or expired code.");
    }
  };

  const handleResendCode = async () => {
    if (!phone) {
      setCodeError("Phone number is missing.");
      return;
    }

    setCodeError(undefined);

    try {
      await resendVerificationCodePhone();
    } catch (error) {
      uiLog.error("[VerifyPhone] Error resending code", { error });
      setCodeError("Failed to resend code. Please try again.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? "#0B1020" : "#FFF" }}>
      {isSending ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <ActivityIndicator size="large" />
          <Text style={{ color: theme.dark ? "#9BA8C0" : "#6B7280" }}>
            Sending verification code…
          </Text>
        </View>
      ) : sendFailed ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingHorizontal: 24,
          }}
        >
          <Text
            style={{
              textAlign: "center",
              color: theme.dark ? "#9BA8C0" : "#6B7280",
            }}
          >
            Could not send verification code.
          </Text>
          <Button mode="contained" onPress={sendCode}>
            Try again
          </Button>
        </View>
      ) : (
        <VerificationCodeContent
          phone={phone}
          error={codeError}
          onVerifyCode={handleVerifyCode}
          onResendCode={handleResendCode}
        />
      )}
      <AppSnackbar
        visible={snackbar.visible}
        variant={snackbar.variant}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
      >
        {snackbar.message}
      </AppSnackbar>
    </View>
  );
}
