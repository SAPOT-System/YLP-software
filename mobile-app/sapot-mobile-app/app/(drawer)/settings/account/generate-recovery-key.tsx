import { RecoveryKeyDownloadModal } from "@/features/auth";
import { generateNewRecoveryKeyApi } from "@/features/auth/api/auth.api";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { getItemAsync } from "expo-secure-store";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function GenerateRecoveryKey() {
  const theme = useTheme();
  const { setupTokenBlob } = useRecoveryKeySetup();
  const [isGenerating, setIsGenerating] = useState(false);
  const [recoveryKeyData, setRecoveryKeyData] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showError,
    hideToast,
  } = useToast();

  useEffect(() => {
    uiLog.info("[GenerateRecoveryKey] mounted");
    return () => {
      uiLog.info("[GenerateRecoveryKey] unmounted");
    };
  }, []);

  const handleGenerate = async () => {
    uiLog.debug("[GenerateRecoveryKey] handleGenerate called");
    try {
      setIsGenerating(true);
      const token = await getItemAsync("access_token");
      if (!token) {
        showError("Unable to authenticate. Please log in again.");
        return;
      }
      const res = await generateNewRecoveryKeyApi(token);
      setRecoveryKeyData(res.data);
      try {
        await setupTokenBlob(res.data);
      } catch {
        showError(
          "Recovery key generated on server but could not be stored locally. Please try generating again."
        );
        return;
      }
      setModalVisible(true);
    } catch (error) {
      uiLog.error("[GenerateRecoveryKey] Error generating recovery key", {
        error,
      });
      showError("Failed to generate recovery key. Please try again.");
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
        <Button
          mode="contained"
          style={{ width: 164 }}
          onPress={handleGenerate}
          loading={isGenerating}
          disabled={isGenerating}
        >
          Generate
        </Button>
      </View>
      <RecoveryKeyDownloadModal
        visible={modalVisible}
        fileData={recoveryKeyData}
        hideModal={() => setModalVisible(false)}
      />
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </View>
  );
}
