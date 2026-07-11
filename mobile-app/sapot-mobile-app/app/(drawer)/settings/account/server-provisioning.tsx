import { IS_DEBUG_ENABLED } from "@/config/debug";
import { ProvisioningQrScanner } from "@/features/settings/components/provisioning-qr-scanner";
import { discoverServerIp } from "@/features/settings/services/server-discovery-service";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { uiLog } from "@/features/shared/core/utils/logger";
import {
  useCertProvisioningService,
  useMainContainer,
  useToast,
} from "@/features/shared/hooks";
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from "@react-native-documents/picker";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";

// Auto-detect gives up after this long and shows "not found" — chosen to be
// long enough to catch a slow LAN mDNS resolve without leaving the user
// staring at a spinner.
const AUTO_DETECT_TIMEOUT_MS = 5000;

// Dev/QA-only screen — never rendered in a release build. Gated at the
// outermost component (no hooks called here) so `ServerProvisioningForm`
// below can call hooks unconditionally per the Rules of Hooks.
export default function ServerProvisioningScreen() {
  if (!IS_DEBUG_ENABLED) return null;
  return <ServerProvisioningForm />;
}

type AutoDetectState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "not-found" }
  | { status: "found"; ip: string; caFp?: string }
  | { status: "mismatch"; ip: string; scanned: string; active: string };

function ServerProvisioningForm() {
  const theme = useTheme();
  const certProvisioning = useCertProvisioningService();
  const { zeroconfAdapter } = useMainContainer();
  const { visible, message, variant, showToast, showError, hideToast } =
    useToast();

  const [ip, setIp] = useState("");
  const [savingIp, setSavingIp] = useState(false);
  const [importingCa, setImportingCa] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [autoDetect, setAutoDetect] = useState<AutoDetectState>({
    status: "idle",
  });

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

  const handleAutoDetect = async () => {
    setAutoDetect({ status: "scanning" });
    try {
      const found = await discoverServerIp(zeroconfAdapter, AUTO_DETECT_TIMEOUT_MS);

      if (!found) {
        uiLog.info("[ServerProvisioning] auto-detect found no server");
        setAutoDetect({ status: "not-found" });
        return;
      }

      setIp(found.ip);
      await certProvisioning.setServerIp(found.ip);
      uiLog.info("[ServerProvisioning] auto-detect applied server IP", {
        hasCaFp: Boolean(found.caFp),
      });

      if (found.caFp) {
        const activeFingerprint = await certProvisioning.currentFingerprint();
        if (activeFingerprint && activeFingerprint !== found.caFp) {
          setAutoDetect({
            status: "mismatch",
            ip: found.ip,
            scanned: found.caFp,
            active: activeFingerprint,
          });
          return;
        }
      }

      setAutoDetect({ status: "found", ip: found.ip, caFp: found.caFp });
      showToast(`Server found at ${found.ip}`);
    } catch (error) {
      uiLog.error("[ServerProvisioning] auto-detect failed", { error });
      setAutoDetect({ status: "not-found" });
      showError(
        error instanceof Error ? error.message : "Auto-detect failed"
      );
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

      <Button
        mode="outlined"
        onPress={() => setShowQrScanner(true)}
        style={{ marginBottom: 12 }}
        accessibilityLabel="Scan provisioning QR code"
      >
        Scan QR
      </Button>

      <Button
        mode="outlined"
        onPress={handleAutoDetect}
        loading={autoDetect.status === "scanning"}
        disabled={autoDetect.status === "scanning"}
        style={{ marginBottom: 8 }}
        accessibilityLabel="Auto-detect server on the local network"
      >
        Auto-detect
      </Button>

      {autoDetect.status === "not-found" && (
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.errorContainer,
            marginBottom: 24,
          }}
        >
          <Text style={{ color: theme.colors.onErrorContainer }}>
            No server found on the local network. Enter the IP manually or
            scan the provisioning QR code instead.
          </Text>
        </View>
      )}

      {autoDetect.status === "mismatch" && (
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.errorContainer,
            marginBottom: 24,
          }}
        >
          <Text style={{ color: theme.colors.onErrorContainer }}>
            Server IP was set to {autoDetect.ip}, but the advertised CA
            fingerprint ({autoDetect.scanned}) does not match the currently
            active fingerprint ({autoDetect.active}). Verify this is the
            correct server and re-import the CA if needed.
          </Text>
        </View>
      )}

      {autoDetect.status === "found" && (
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceVariant,
            marginBottom: 24,
          }}
        >
          <Text style={{ color: theme.colors.onSurface }}>
            Server found at {autoDetect.ip}
            {autoDetect.caFp
              ? ` — advertised fingerprint matches the active CA.`
              : ` — no CA fingerprint was advertised; import the CA separately to complete provisioning.`}
          </Text>
        </View>
      )}

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

      <Modal
        visible={showQrScanner}
        animationType="slide"
        onRequestClose={() => setShowQrScanner(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: 48,
          }}
        >
          <Button
            mode="text"
            onPress={() => setShowQrScanner(false)}
            style={{ alignSelf: "flex-start", marginLeft: 8 }}
          >
            Close
          </Button>
          <ProvisioningQrScanner onDone={() => setShowQrScanner(false)} />
        </View>
      </Modal>
    </ScrollView>
  );
}
