import { changePasswordApi } from "@/features/auth/api/auth.api";
import { useMasterKeyRecovery } from "@/features/auth/hooks/use-master-key-recovery";
import {
    hasValidationErrors,
    validatePassword,
} from "@/features/auth/utils/validation";
import { SettingsTextInput } from "@/features/settings";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useServerAction, useToast, useUserProfile } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
    Button,
    HelperText,
    useTheme,
} from "react-native-paper";
import { isAxiosError } from "axios";

export default function ChangePassword() {
  const theme = useTheme();
  const { rewrapAllBlobs } = useMasterKeyRecovery();
  const { user } = useUserProfile();
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showToast,
    showError,
    hideToast,
  } = useToast();
  const { isServerOffline } = useServerAction();

  useEffect(() => {
    uiLog.info("[ChangePasswordSettings] mounted");
    return () => {
      uiLog.info("[ChangePasswordSettings] unmounted");
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
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
      showError("Cannot reach server. Please check your connection.");
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

      const rewrapResult = await rewrapAllBlobs({ userId: user?.id ?? "", newPassword: newPass });
      if (!rewrapResult.success) {
        showError("Password changed but recovery keys could not be updated. Visit Settings → Recovery Methods to re-configure.");
      }

      backTimerRef.current = setTimeout(() => {
        uiLog.info("[Navigation] goBack triggered from ChangePasswordSettings");
        router.back();
      }, 1000);
    } catch (error) {
      uiLog.error("[ChangePasswordSettings] Error in change password", {
        error,
      });
      if (
        isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        setErrors({ currentPassword: "Incorrect password." });
      } else {
        showError("Something went wrong. Please try again.");
      }
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
              secureTextEntry={!showCurrent}
              icon={showCurrent ? "eye-off" : "eye"}
              onIconPress={() => setShowCurrent((prev) => !prev)}
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
              secureTextEntry={!showNew}
              icon={showNew ? "eye-off" : "eye"}
              onIconPress={() => setShowNew((prev) => !prev)}
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
              secureTextEntry={!showConfirm}
              icon={showConfirm ? "eye-off" : "eye"}
              onIconPress={() => setShowConfirm((prev) => !prev)}
            />
          </View>
          <HelperText type="error" visible={Boolean(errors.confirmPassword)}>
            {errors.confirmPassword}
          </HelperText>
        </View>
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
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </View>
  );
}
