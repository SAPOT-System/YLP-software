import { SETTINGS_ROUTES } from "@/config/routes";
import { usePhoneVerificationService, useUserService } from "@/features/auth";
import { toInternationalPhone } from "@/features/auth/utils/validation";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { VerificationCodeContent } from "@/features/settings";
import AppSnackbar from "@/features/shared/components/app-snackbar";
import { useSyncService } from "@/features/shared/hooks/use-sync-service";
import { useGsmService } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/core/utils/logger";
import { getGsmErrorMessage } from "@/features/shared/core/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";

export default function VerifyPhone() {
  const { phone, reauth_token } = useLocalSearchParams<{ phone: string; reauth_token?: string }>();
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
  const gsmService = useGsmService();
  const phoneVerificationService = usePhoneVerificationService();
  const { setupPhoneBlob } = useRecoveryKeySetup();
  const syncService = useSyncService();

  useEffect(() => {
    uiLog.info("[VerifyPhone] mounted");
    sendCode();
    return () => {
      uiLog.info("[VerifyPhone] unmounted");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCode = async () => {
    setIsSending(true);
    setSendFailed(false);
    const gsmHealth = await gsmService.getHealth().catch(() => null);
    if (!gsmHealth?.gsm_ready) {
      setSnackbar({
        visible: true,
        message:
          "SMS service is currently unavailable. Please try again later.",
        variant: "error",
      });
      setSendFailed(true);
      setIsSending(false);
      return;
    }
    try {
      setIsSending(false);
      await phoneVerificationService.requestVerification(
        phone ? toInternationalPhone(phone) : undefined,
        reauth_token || undefined
      );
      setCodeError(undefined);
    } catch (error) {
      uiLog.error("[VerifyPhone] Error requesting phone verification", {
        error,
      });
      setSendFailed(true);
      setSnackbar({
        visible: true,
        message: getGsmErrorMessage(
          error,
          "Failed to send verification code. Please try again."
        ),
        variant: "error",
      });
    } 
  };

  const handleVerifyCode = async (code: string) => {
    if (!phone) {
      setCodeError("Phone number is missing.");
      return;
    }

    setCodeError(undefined);

    try {
      await phoneVerificationService.verifyCode(code);
      await userService.updateAuthenticatedUser({
        phoneNumber: toInternationalPhone(phone),
        phoneNumberVerified: true,
      });
      await setupPhoneBlob(phone);
      try {
        const migration = await phoneVerificationService.migratePhoneUser();
        if (migration.migrated) {
          uiLog.info("[VerifyPhone] ghost user migrated", {
            ghostUserId: migration.ghost_user_id,
          });
          await syncService.syncNow();
        }
      } catch (migrationError) {
        uiLog.warn("[VerifyPhone] migration failed (non-fatal)", {
          error: migrationError,
        });
      }
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
      await phoneVerificationService.resendCode();
    } catch (error) {
      uiLog.error("[VerifyPhone] Error resending code", { error });
      setCodeError(
        getGsmErrorMessage(error, "Failed to resend code. Please try again.")
      );
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
          <LoadingSpinner size="large" />
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
