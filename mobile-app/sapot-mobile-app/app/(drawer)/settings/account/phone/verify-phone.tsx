import { SETTINGS_ROUTES } from "@/config/routes";
import { useUserService } from "@/features/auth";
import {
  checkGsmHealth,
  requestPhoneVerification,
  resendVerificationCodePhone,
  verifyCodePhone,
} from "@/features/auth/api/auth.api";
import VerificationCodeModal from "@/features/settings/components/verification-code-modal";
import AppSnackbar from "@/features/shared/components/app-snackbar";
import { uiLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function VerifyPhone() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const theme = useTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalError, setModalError] = useState<string | undefined>(undefined);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant: "neutral" | "error" }>({
    visible: false,
    message: "",
    variant: "neutral",
  });
  const userService = useUserService();

  const showSnackbar = (message: string, variant: "neutral" | "error" = "neutral") => {
    setSnackbar({ visible: true, message, variant });
  };

  useEffect(() => {
    uiLog.info("[VerifyPhone] mounted");
    return () => {
      uiLog.info("[VerifyPhone] unmounted");
    };
  }, []);

  const handleVerify = async () => {
    uiLog.debug("[VerifyPhone] handleVerify called");
    const gsmOnline = await checkGsmHealth();
    if (!gsmOnline) {
      showSnackbar("SMS service is currently unavailable. Please try again later.", "error");
      return;
    }
    try {
      await requestPhoneVerification();
      setModalError(undefined);
      setIsModalVisible(true);
    } catch (error) {
      uiLog.error("[VerifyPhone] Error requesting phone verification", { error });
      showSnackbar("Failed to send verification code. Please try again.", "error");
    }
  };

  const handleVerifyCode = async (code: string) => {
    if (!phone) {
      setModalError("Phone number is missing.");
      return;
    }

    setModalError(undefined);

    try {
      await verifyCodePhone(code);
      setIsModalVisible(false);

      await userService.updateAuthenticatedUser({ phoneNumberVerified: true });
      uiLog.info("[Navigation] Navigating to ManageProfile", {
        screen: SETTINGS_ROUTES.MANAGE_PROFILE,
      });
      router.replace(SETTINGS_ROUTES.MANAGE_PROFILE);
    } catch (error) {
      uiLog.error("[VerifyPhone] Error in verify code", { error });
      setModalError("Invalid or expired code.");
    }
  };

  const handleResendCode = async () => {
    if (!phone) {
      setModalError("Phone number is missing.");
      return;
    }

    setModalError(undefined);

    try {
      await resendVerificationCodePhone();
    } catch (error) {
      uiLog.error("[VerifyPhone] Error in resend code", { error });
      setModalError("Failed to resend code. Please try again.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? "#0B1020" : "#FFF" }}>
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 30,
          alignItems: "center",
          gap: 10,
        }}
      >
        <View
          style={{
            paddingHorizontal: 40,
            paddingVertical: 46,
            backgroundColor: theme.dark ? "#1A233A" : "#EAEDF3",
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              fontWeight: "medium",
              textAlign: "center",
              fontSize: 17,
              color: theme.dark ? "#E6ECF5" : "#000000",
            }}
          >
            Verify with Phone
          </Text>
          <Text
            style={{
              fontSize: 17,
              textAlign: "center",
              color: theme.dark ? "#E6ECF5" : "#000000",
            }}
          >
            A 6-digit code will be sent to{" "}
          </Text>
          <Text
            style={{
              fontWeight: "medium",
              fontSize: 17,
              textAlign: "center",
              color: theme.dark ? "#3A7AFE" : "#103462",
            }}
          >
            {phone}
          </Text>
        </View>
        <Button mode="contained" style={{ width: 164 }} onPress={handleVerify}>
          Verify Phone
        </Button>
      </View>
      <VerificationCodeModal
        visible={isModalVisible}
        phone={phone}
        onDismiss={() => {
          uiLog.debug("[VerifyPhone] modal dismissed");
          setIsModalVisible(false);
        }}
        error={modalError}
        onVerifyCode={handleVerifyCode}
        onResendCode={handleResendCode}
      />
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
