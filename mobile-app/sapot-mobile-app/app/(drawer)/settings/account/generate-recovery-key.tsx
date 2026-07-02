import { SETTINGS_ROUTES } from "@/config/routes";
import { RecoveryKeyDownloadModal } from "@/features/auth";
import { generateNewRecoveryKeyApi } from "@/features/auth/api/auth.api";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { useRecoveryConstraints } from "@/features/auth/hooks/use-recovery-constraints";
import { SettingsTextInput } from "@/features/settings";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { uiLog } from "@/features/shared/core/utils/logger";
import { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, HelperText, Text, useTheme } from "react-native-paper";

export default function GenerateRecoveryKey() {
  const theme = useTheme();
  const { setupTokenBlob } = useRecoveryKeySetup();
  const { data: constraints, isLoading: constraintsLoading } = useRecoveryConstraints();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<"loading" | "success" | "error">("loading");
  const [overlayMessage, setOverlayMessage] = useState("");
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [recoveryKeyData, setRecoveryKeyData] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    uiLog.info("[GenerateRecoveryKey] mounted");
    return () => {
      uiLog.info("[GenerateRecoveryKey] unmounted");
    };
  }, []);

  const rkConstraint = constraints?.recovery_key;
  const inCooldown = rkConstraint != null && !rkConstraint.can_change;

  const handleGenerate = async () => {
    uiLog.debug("[GenerateRecoveryKey] handleGenerate called");
    if (!password.trim()) {
      setPasswordError("Current password is required");
      return;
    }
    try {
      setIsGenerating(true);
      setOverlayStatus("loading");
      setOverlayVisible(true);
      const res = await generateNewRecoveryKeyApi(password);
      setRecoveryKeyData(res.data);
      try {
        await setupTokenBlob(res.data);
      } catch {
        setOverlayStatus("error");
        setOverlayMessage(
          "Recovery key generated but could not be stored locally. Please try again."
        );
        return;
      }
      setOverlayStatus("success");
      setOverlayMessage("Recovery key generated successfully");
    } catch (error) {
      uiLog.error("[GenerateRecoveryKey] Error generating recovery key", { error });
      setOverlayVisible(false);
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          setPasswordError("Incorrect password.");
        } else if (status === 429) {
          const detail = error.response?.data?.detail;
          const days = typeof detail === "object" ? detail?.days_remaining : null;
          setPasswordError(
            days != null
              ? `Recovery key is in cooldown. Try again in ${days} day${days === 1 ? "" : "s"}.`
              : "Recovery key cannot be changed yet."
          );
        } else {
          setOverlayStatus("error");
          setOverlayMessage("Failed to generate recovery key. Please try again.");
          setOverlayVisible(true);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center", gap: 24 }}>
        <View
          style={{
            alignItems: "stretch",
            width: "100%",
            backgroundColor: theme.colors.background,
            borderRadius: 4,
            padding: 16,
            gap: 8,
          }}
        >
          <Text variant="titleSmall">About Recovery Keys</Text>
          <Text variant="bodySmall">
            A recovery key lets you regain access to your account if you forget
            your password. Generating a new key will invalidate your previous
            one. Store it somewhere safe.
          </Text>
        </View>
        {inCooldown && rkConstraint?.days_until_changeable != null && (
          <View
            style={{
              backgroundColor: theme.colors.errorContainer,
              borderRadius: 4,
              padding: 12,
              width: "100%",
            }}
          >
            <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
              Recovery key is in a cooldown period. You can generate a new key in{" "}
              <Text variant="labelSmall" style={{ fontWeight: "700" }}>
                {rkConstraint.days_until_changeable} day{rkConstraint.days_until_changeable === 1 ? "" : "s"}
              </Text>.
            </Text>
          </View>
        )}
        <View style={{ alignItems: "stretch", width: "100%", gap: 4 }}>
          <SettingsTextInput
            placeholder="Current Password"
            label="Current Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(undefined);
            }}
            secureTextEntry={!showPassword}
            icon={showPassword ? "eye-off" : "eye"}
            onIconPress={() => setShowPassword((prev) => !prev)}
            error={Boolean(passwordError)}
            editable={!inCooldown}
          />
          <HelperText type="error" visible={Boolean(passwordError)}>
            {passwordError}
          </HelperText>
        </View>
        <Button
          mode="contained"
          style={{ width: 164 }}
          onPress={handleGenerate}
          loading={isGenerating || constraintsLoading}
          disabled={isGenerating || constraintsLoading || inCooldown}
        >
          Generate
        </Button>
      </View>
      <LoadingOverlay
        visible={overlayVisible}
        status={overlayStatus}
        statusMessage={overlayMessage}
        onDismiss={() => {
          setOverlayVisible(false);
          if (overlayStatus === "success") setModalVisible(true);
        }}
      />
      <RecoveryKeyDownloadModal
        visible={modalVisible}
        fileData={recoveryKeyData}
        hideModal={() => setModalVisible(false)}
        route={SETTINGS_ROUTES.PASSWORD_AND_SECURITY}
      />
    </View>
  );
}
