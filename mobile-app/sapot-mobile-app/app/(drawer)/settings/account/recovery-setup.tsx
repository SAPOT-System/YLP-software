import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Divider, Switch, Text, TextInput, useTheme } from "react-native-paper";

export default function RecoverySetup() {
  const theme = useTheme();
  const { setup } = useRecoveryKeySetup();
  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showToast, showError, hideToast } = useToast();

  const [password, setPassword] = useState("");
  const [enableToken, setEnableToken] = useState(false);
  const [recoveryTokenHex, setRecoveryTokenHex] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    uiLog.info("[RecoverySetup] mounted");
    return () => {
      uiLog.info("[RecoverySetup] unmounted");
    };
  }, []);

  const handleSetup = async () => {
    if (!password) {
      showError("Enter your current password to configure recovery methods.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await setup({ userId: "", password, enableToken });
      if (result.success) {
        if (result.recoveryTokenHex) {
          setRecoveryTokenHex(result.recoveryTokenHex);
        }
        showToast("Recovery methods configured.");
      } else {
        showError("Failed to configure recovery methods. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, gap: 16 }}>
        <Text variant="titleMedium">Recovery Methods</Text>
        <Text variant="bodySmall">
          Configure how you can recover your encrypted data if you forget your password.
        </Text>
        <Divider />
        <TextInput
          label="Current Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          mode="outlined"
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text>Generate Recovery Token</Text>
          <Switch value={enableToken} onValueChange={setEnableToken} />
        </View>
        {recoveryTokenHex && (
          <View style={{ backgroundColor: theme.colors.background, padding: 12, borderRadius: 4 }}>
            <Text variant="labelSmall">Recovery Token (save this somewhere safe):</Text>
            <Text selectable style={{ fontFamily: "monospace", marginTop: 4 }}>
              {recoveryTokenHex}
            </Text>
          </View>
        )}
        <Button mode="contained" onPress={handleSetup} loading={isSaving} disabled={isSaving}>
          Save Recovery Methods
        </Button>
      </View>
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </ScrollView>
  );
}
