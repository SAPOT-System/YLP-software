import { SETTINGS_ROUTES } from "@/app/routes";
import { useUserService } from "@/features/auth";
import {
  resendVerificationCodeEmail,
  verifyCodeEmail,
} from "@/features/auth/api/auth.api";
import VerificationCodeModal from "@/features/settings/components/verification-code-modal";
import { updateProfileApi } from "@/features/shared/api/user-profile.api";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const theme = useTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalError, setModalError] = useState<string | undefined>(undefined);
  const userService = useUserService();
  const handleVerify = async () => {
    await resendVerificationCodeEmail();
    setModalError(undefined);
    setIsModalVisible(true);
  };

  const handleVerifyCode = async (code: string) => {
    if (!email) {
      setModalError("Email address is missing.");
      return;
    }

    setModalError(undefined);

    try {
      await verifyCodeEmail(code);
      await updateProfileApi({ email });
      setIsModalVisible(false);

      await userService.updateAuthenticatedUser({ emailVerified: true });
      router.replace(SETTINGS_ROUTES.MANAGE_PROFILE);
    } catch {
      setModalError("Invalid or expired code.");
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setModalError("Email address is missing.");
      return;
    }

    setModalError(undefined);

    try {
      await resendVerificationCodeEmail();
    } catch {
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
            Verify with Email
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
            {email}
          </Text>
        </View>
        <Button mode="contained" style={{ width: 164 }} onPress={handleVerify}>
          Verify Email
        </Button>
      </View>
      <VerificationCodeModal
        visible={isModalVisible}
        email={email}
        onDismiss={() => setIsModalVisible(false)}
        error={modalError}
        onVerifyCode={handleVerifyCode}
        onResendCode={handleResendCode}
      />
    </View>
  );
}
