import { SETTINGS_ROUTES } from "@/config/routes";
import { SettingsTextInput } from "@/features/settings";
import AppSnackbar from "@/features/shared/components/app-snackbar";
import { useServerAction } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, HelperText, useTheme } from "react-native-paper";

export default function EditPhone() {
  const theme = useTheme();
  const { reauth_token } = useLocalSearchParams<{ reauth_token?: string }>();
  const { isServerOffline } = useServerAction();
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant: "neutral" | "error";
  }>({ visible: false, message: "", variant: "neutral" });

  useEffect(() => {
    uiLog.info("[EditPhone] mounted");
    return () => {
      uiLog.info("[EditPhone] unmounted");
    };
  }, []);

  const handleSubmit = async () => {
    uiLog.debug("[EditPhone] handleSubmit called");
    const normalized = phone.trim();

    if (!/^09\d{9}$/.test(normalized)) {
      setPhoneError("Phone number must be in the format 09XXXXXXXXX");
      return;
    }

    if (isServerOffline) {
      setSnackbar({ visible: true, message: "Server unavailable. Cannot save.", variant: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      uiLog.info("[EditPhone] navigating to verify", { phone: normalized });
      router.push({
        pathname: SETTINGS_ROUTES.VERIFY_PHONE,
        params: { phone: normalized, reauth_token: reauth_token ?? "" },
      });
    } catch (error) {
      uiLog.error("[EditPhone] failed to navigate", { error });
      setSnackbar({ visible: true, message: "Failed to proceed. Please try again.", variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 30, alignItems: "center" }}>
        <View style={{ width: "100%" }}>
          <SettingsTextInput
            label="Phone Number"
            placeholder="09XXXXXXXXX"
            value={phone}
            keyboardType="phone-pad"
            onChangeText={(text) => {
              setPhone(text);
              if (phoneError) setPhoneError(undefined);
            }}
            error={Boolean(phoneError)}
          />
          <HelperText type="error" visible={Boolean(phoneError)}>
            {phoneError ?? " "}
          </HelperText>
          <HelperText type="info" visible={!phoneError}>
            Format: 09XXXXXXXXX
          </HelperText>
        </View>
        <Button
          mode="contained"
          style={{ width: 164 }}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting || phone.trim().length === 0}
        >
          Save & Verify
        </Button>
      </View>
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
