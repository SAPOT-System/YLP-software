import { SETTINGS_ROUTES } from "@/config/routes";
import { useUserService } from "@/features/auth";
import {
  resendVerificationCodeEmail,
  verifyCodeEmail,
} from "@/features/auth/api/auth.api";
import { VerificationCodeContent } from "@/features/settings";
import { updateProfileApi } from "@/features/shared/api/user-profile.api";
import AppSnackbar from "@/features/shared/components/app-snackbar";
import { uiLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const theme = useTheme();
  const [isSending, setIsSending] = useState(true);
  const [sendFailed, setSendFailed] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: "neutral" | "error";
  }>({ visible: false, message: "", variant: "neutral" });
  const userService = useUserService();

  useEffect(() => {
    uiLog.info("[VerifyEmail] mounted");
    sendCode();
    return () => {
      uiLog.info("[VerifyEmail] unmounted");
    };
  }, []);

  const sendCode = async () => {
    setIsSending(true);
    setSendFailed(false);
    try {
      await resendVerificationCodeEmail();
      setCodeError(undefined);
    } catch (error) {
      uiLog.error("[VerifyEmail] Error sending verification code", { error });
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
    if (!email) {
      setCodeError("Email address is missing.");
      return;
    }

    setCodeError(undefined);

    try {
      await verifyCodeEmail(code);
      await updateProfileApi({ email });
      await userService.updateAuthenticatedUser({ emailVerified: true });
      uiLog.info("[VerifyEmail] email verified, navigating to EmailVerified");
      router.replace(SETTINGS_ROUTES.EMAIL_VERIFIED);
    } catch (error) {
      uiLog.error("[VerifyEmail] Error verifying code", { error });
      setCodeError("Invalid or expired code.");
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setCodeError("Email address is missing.");
      return;
    }

    setCodeError(undefined);

    try {
      await resendVerificationCodeEmail();
    } catch (error) {
      uiLog.error("[VerifyEmail] Error resending code", { error });
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
          email={email}
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
