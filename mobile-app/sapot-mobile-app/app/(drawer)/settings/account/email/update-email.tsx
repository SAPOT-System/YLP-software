import { SETTINGS_ROUTES } from "@/config/routes";
import { validateEmail } from "@/features/auth/utils/validation";
import { SettingsTextInput } from "@/features/settings";
import { uiLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, HelperText, useTheme } from "react-native-paper";

export default function UpdateEmail() {
  const theme = useTheme();
  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [errors, setErrors] = useState<{
    newEmail?: string;
    confirmNewEmail?: string;
  }>({});

  useEffect(() => {
    uiLog.info("[UpdateEmail] mounted");
    return () => {
      uiLog.info("[UpdateEmail] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[UpdateEmail] useEffect triggered, deps:", {
      newEmailLength: newEmail.length,
      confirmEmailLength: confirmNewEmail.length,
    });
  }, [newEmail, confirmNewEmail]);

  const handleSubmit = async () => {
    uiLog.debug("[UpdateEmail] handleSubmit called");
    const nextErrors: { newEmail?: string; confirmNewEmail?: string } = {};
    const emailError = validateEmail(newEmail);
    if (emailError) {
      nextErrors.newEmail = emailError;
    }

    if (!confirmNewEmail.trim()) {
      nextErrors.confirmNewEmail = "Please confirm your email";
    } else if (newEmail.trim() !== confirmNewEmail.trim()) {
      nextErrors.confirmNewEmail = "Emails do not match";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      uiLog.warn("[UpdateEmail] validation failed");
      return;
    }

    uiLog.info("[Navigation] Navigating to VerifyEmail", {
      screen: SETTINGS_ROUTES.VERIFY_EMAIL,
    });
    router.push({
      pathname: SETTINGS_ROUTES.VERIFY_EMAIL,
      params: { email: newEmail.trim() },
    });
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 30,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%" }}>
          <SettingsTextInput
            label="New Email Address"
            placeholder="Email Address"
            value={newEmail}
            onChangeText={(text) => {
              setNewEmail(text);
              if (errors.newEmail) {
                setErrors((prev) => ({ ...prev, newEmail: undefined }));
              }
            }}
            error={Boolean(errors.newEmail)}
          />
          <HelperText type="error" visible={Boolean(errors.newEmail)}>
            {errors.newEmail}
          </HelperText>
          <SettingsTextInput
            label="Confirm Email Address"
            placeholder="Email Address"
            value={confirmNewEmail}
            onChangeText={(text) => {
              setConfirmNewEmail(text);
              if (errors.confirmNewEmail) {
                setErrors((prev) => ({ ...prev, confirmNewEmail: undefined }));
              }
            }}
            error={Boolean(errors.confirmNewEmail)}
          />
          <HelperText type="error" visible={Boolean(errors.confirmNewEmail)}>
            {errors.confirmNewEmail}
          </HelperText>
        </View>
        <Button mode="contained" style={{ width: 164 }} onPress={handleSubmit}>
          Submit
        </Button>
      </View>
    </View>
  );
}
