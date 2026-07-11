import { IS_DEBUG_ENABLED } from "@/config/debug";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { uiLog } from "@/features/shared/core/utils/logger";
import { useCertProvisioningService, useToast } from "@/features/shared/hooks";
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from "@react-native-documents/picker";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";

// Dev/QA-only screen — never rendered in a release build. Gated at the
// outermost component (no hooks called here) so `ServerProvisioningForm`
// below can call hooks unconditionally per the Rules of Hooks.
export default function ServerProvisioningScreen() {
  if (!IS_DEBUG_ENABLED) return null;
  return <ServerProvisioningForm />;
}

function ServerProvisioningForm() {
  const theme = useTheme();
  const certProvisioning = useCertProvisioningService();
  const { visible, message, variant, showToast, showError, hideToast } =
    useToast();

  const [ip, setIp] = useState("");
  const [savingIp, setSavingIp] = useState(false);
  const [importingCa, setImportingCa] = useState(false);

  useEffect(() => {
    uiLog.info("[ServerProvisioning] mounted");
    return () => {
      uiLog.info("[ServerProvisioning] unmounted");
    };
  }, []);

  const handleSaveIp = async () => {
    const trimmed = ip.trim();
    if (!trimmed) {
      showError("Enter a server IP address first");
      return;
    }

    setSavingIp(true);
    try {
      await certProvisioning.setServerIp(trimmed);
      uiLog.info("[ServerProvisioning] server IP saved");
      showToast("Server IP saved");
    } catch (error) {
      uiLog.error("[ServerProvisioning] failed to save server IP", { error });
      showError(
        error instanceof Error ? error.message : "Failed to save server IP"
      );
    } finally {
      setSavingIp(false);
    }
  };

  const handleImportCa = async () => {
    setImportingCa(true);
    try {
      const [pickedFile] = await pick({ type: [types.allFiles] });
      const pemText = await new File(pickedFile.uri).text();
      const { fingerprint } = await certProvisioning.importCaPem(pemText);
      uiLog.info("[ServerProvisioning] CA imported", { fingerprint });
      showToast(`CA imported — fingerprint ${fingerprint}`);
    } catch (error) {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
        uiLog.info("[ServerProvisioning] CA import cancelled by user");
        return;
      }
      uiLog.error("[ServerProvisioning] failed to import CA", { error });
      showError(
        error instanceof Error ? error.message : "Failed to import CA certificate"
      );
    } finally {
      setImportingCa(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text
        variant="titleMedium"
        style={{ color: theme.colors.onSurface, marginBottom: 8 }}
      >
        Server IP
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
        }}
      >
        <TextInput
          mode="outlined"
          dense
          placeholder="e.g. 192.168.1.50"
          value={ip}
          onChangeText={setIp}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ flex: 1 }}
          accessibilityLabel="Server IP address"
        />
        <Button
          mode="contained"
          compact
          onPress={handleSaveIp}
          loading={savingIp}
          disabled={savingIp}
        >
          Save
        </Button>
      </View>

      <Text
        variant="titleMedium"
        style={{ color: theme.colors.onSurface, marginBottom: 8 }}
      >
        Trusted CA certificate
      </Text>
      <Button
        mode="outlined"
        onPress={handleImportCa}
        loading={importingCa}
        disabled={importingCa}
        accessibilityLabel="Import CA (.pem)"
      >
        Import CA (.pem)
      </Button>

      <AppSnackbar visible={visible} onDismiss={hideToast} variant={variant}>
        {message}
      </AppSnackbar>
    </ScrollView>
  );
}
