import { RecoveryKeyDownloadModal } from "@/features/auth";
import { generateNewRecoveryKeyApi } from "@/features/auth/api/auth.api";
import { useToast } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { getItemAsync } from "expo-secure-store";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Snackbar, Text, useTheme } from "react-native-paper";

export default function GenerateRecoveryKey() {
  const theme = useTheme();
  const [isGenerating, setIsGenerating] = useState(false);
  const [recoveryKeyData, setRecoveryKeyData] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
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
        showToast("Unable to authenticate. Please log in again.");
        return;
      }
      const res = await generateNewRecoveryKeyApi(token);
      setRecoveryKeyData(res.data);
      setModalVisible(true);
    } catch (error) {
      uiLog.error("[GenerateRecoveryKey] Error generating recovery key", {
        error,
      });
      showToast("Failed to generate recovery key. Please try again.");
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
      <Snackbar visible={toastVisible} onDismiss={hideToast} duration={3000}>
        {toastMessage}
      </Snackbar>
    </View>
  );
}
