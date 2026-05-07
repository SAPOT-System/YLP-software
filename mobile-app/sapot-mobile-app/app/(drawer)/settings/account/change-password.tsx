import { changePasswordApi } from "@/features/auth/api/auth.api";
import {
    hasValidationErrors,
    validatePassword,
} from "@/features/auth/utils/validation";
import { SettingsTextInput } from "@/features/settings";
import { useServerAction, useToast } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import {
    Button,
    HelperText,
    Snackbar,
    Text,
    useTheme,
} from "react-native-paper";

export default function ChangePassword() {
  const theme = useTheme();
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);

  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();
  const { isServerOffline } = useServerAction();

  useEffect(() => {
    uiLog.info("[ChangePasswordSettings] mounted");
    return () => {
      uiLog.info("[ChangePasswordSettings] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[ChangePasswordSettings] useEffect triggered, deps:", {
      hasCurrent: Boolean(currentPass),
      hasNew: Boolean(newPass),
      hasConfirm: Boolean(confirmPass),
      isSaving,
    });
  }, [currentPass, newPass, confirmPass, isSaving]);

  const handleSave = async () => {
    uiLog.debug("[ChangePasswordSettings] handleSave called", {
      currentPass: "[REDACTED]",
      newPass: "[REDACTED]",
      confirmPass: "[REDACTED]",
    });
    if (isServerOffline) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }
    const nextErrors = {
      currentPassword: currentPass ? undefined : "Current password is required",
      ...validatePassword(newPass, confirmPass),
    };

    setErrors(nextErrors);

    if (hasValidationErrors(nextErrors)) {
      return;
    }

    try {
      setIsSaving(true);
      await changePasswordApi(currentPass, newPass);
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
      setErrors({});
      showToast("Change password successfully");

      setTimeout(() => {
        uiLog.info("[Navigation] goBack triggered from ChangePasswordSettings");
        router.back();
      }, 1000);
    } catch (error) {
      uiLog.error("[ChangePasswordSettings] Error in change password", {
        error,
      });
      setErrors({ currentPassword: "Invalid password" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center", gap: 24 }}>
        <View style={{ alignItems: "stretch", width: "100%", gap: 4 }}>
          <View>
            <SettingsTextInput
              placeholder="Current Password"
              label="Current Password"
              value={currentPass}
              onChangeText={(value) => {
                setCurrentPass(value);
                if (errors.currentPassword) {
                  setErrors((prev) => ({
                    ...prev,
                    currentPassword: undefined,
                  }));
                }
              }}
              secureTextEntry
            />
            <HelperText type="error" visible={Boolean(errors.currentPassword)}>
              {errors.currentPassword}
            </HelperText>
          </View>
          <View>
            <SettingsTextInput
              placeholder="New Password"
              label="New Password"
              value={newPass}
              onChangeText={(value) => {
                setNewPass(value);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              secureTextEntry
            />
            <HelperText type="error" visible={Boolean(errors.password)}>
              {errors.password}
            </HelperText>
          </View>
          <View>
            <SettingsTextInput
              placeholder="Confirm Password"
              label="Confirm Password"
              value={confirmPass}
              onChangeText={(value) => {
                setConfirmPass(value);
                if (errors.confirmPassword) {
                  setErrors((prev) => ({
                    ...prev,
                    confirmPassword: undefined,
                  }));
                }
              }}
              secureTextEntry
            />
          </View>
          <HelperText type="error" visible={Boolean(errors.confirmPassword)}>
            {errors.confirmPassword}
          </HelperText>
        </View>
        <Text
          variant="bodyMedium"
          style={{
            textDecorationLine: "underline",
            textAlign: "left",
            textDecorationColor: theme.colors.inverseOnSurface,
            color: theme.colors.inverseOnSurface,
          }}
        >
          Forgot password?
        </Text>
        <Button
          mode="contained"
          style={{ width: 164 }}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
        >
          Save
        </Button>
      </View>
      <Snackbar visible={toastVisible} onDismiss={hideToast} duration={3000}>
        {toastMessage}
      </Snackbar>
    </View>
  );
}
