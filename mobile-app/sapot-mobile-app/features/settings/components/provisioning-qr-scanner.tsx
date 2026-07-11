import { uiLog } from "@/features/shared/core/utils/logger";
import { useCertProvisioningService } from "@/features/shared/hooks";
import { Camera, CameraView, type BarcodeScanningResult } from "expo-camera";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { parseProvisioningQr } from "../services/provisioning-qr";

type ResultState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "match"; ip: string; fingerprint: string }
  | { status: "mismatch"; ip: string; scanned: string; active: string }
  | { status: "no-active-anchor"; ip: string; scanned: string };

interface ProvisioningQrScannerProps {
  onDone?: () => void;
}

// Dev/QA-only scanner used from the server-provisioning screen. Mirrors the
// permission handling and CameraView usage of
// `app/(drawer)/(tabs)/scan-qr.tsx`. The scanned caFp is an out-of-band
// confirmation only — it does not itself grant trust; the CA certificate
// must already be bundled or imported separately via PEM.
export function ProvisioningQrScanner({ onDone }: ProvisioningQrScannerProps) {
  const theme = useTheme();
  const certProvisioning = useCertProvisioningService();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  useEffect(() => {
    let isMounted = true;
    const requestPermission = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (isMounted) {
        setHasPermission(status === "granted");
      }
    };
    requestPermission();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleScanAgain = () => {
    setResult({ status: "idle" });
    setIsScanning(true);
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    // Scanning-lock: onBarcodeScanned is disabled (undefined handler) below
    // whenever isScanning is false, so a single QR presented across many
    // camera frames only triggers this handler once, until "Scan Again".
    setIsScanning(false);

    let payload;
    try {
      payload = parseProvisioningQr(data);
    } catch (error) {
      uiLog.warn("[ProvisioningQrScanner] failed to parse QR data", { error });
      setResult({
        status: "error",
        message: "QR code is not a valid provisioning payload.",
      });
      return;
    }

    try {
      await certProvisioning.setServerIp(payload.ip);
      const activeFingerprint = await certProvisioning.currentFingerprint();

      if (!activeFingerprint) {
        // No trust anchor active yet (e.g. first-time setup before a CA has
        // been bundled/imported) — nothing to compare against. Surface this
        // distinctly rather than silently treating it as a match: the
        // operator still needs to import/confirm a CA separately.
        setResult({
          status: "no-active-anchor",
          ip: payload.ip,
          scanned: payload.caFp,
        });
        return;
      }

      if (activeFingerprint !== payload.caFp) {
        setResult({
          status: "mismatch",
          ip: payload.ip,
          scanned: payload.caFp,
          active: activeFingerprint,
        });
        return;
      }

      setResult({
        status: "match",
        ip: payload.ip,
        fingerprint: activeFingerprint,
      });
      onDone?.();
    } catch (error) {
      uiLog.error("[ProvisioningQrScanner] failed to apply server IP", {
        error,
      });
      setResult({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to save server IP",
      });
    }
  };

  const statusText = useMemo(() => {
    if (hasPermission === null) {
      return "Requesting camera permission...";
    }
    if (hasPermission === false) {
      return "Camera access denied. Enable it in system settings to scan a provisioning QR code.";
    }
    return null;
  }, [hasPermission]);

  return (
    <View style={styles.container}>
      {hasPermission === true ? (
        <View style={styles.cameraWrapper}>
          <CameraView
            style={styles.camera}
            facing={"back"}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
          />
        </View>
      ) : (
        <View style={styles.permissionState}>
          <Text style={{ color: theme.colors.onSurface }}>{statusText}</Text>
        </View>
      )}

      <View style={styles.resultArea}>
        {result.status === "error" && (
          <View
            style={[styles.card, { backgroundColor: theme.colors.errorContainer }]}
          >
            <Text style={{ color: theme.colors.onErrorContainer }}>
              {result.message}
            </Text>
          </View>
        )}

        {result.status === "mismatch" && (
          <View
            style={[styles.card, { backgroundColor: theme.colors.errorContainer }]}
          >
            <Text
              style={[
                styles.warningTitle,
                { color: theme.colors.onErrorContainer },
              ]}
            >
              Fingerprint mismatch
            </Text>
            <Text style={{ color: theme.colors.onErrorContainer }}>
              Server IP was set to {result.ip}, but the scanned CA fingerprint
              ({result.scanned}) does not match the currently active
              fingerprint ({result.active}). Verify you scanned the correct
              server and re-import the CA if needed.
            </Text>
          </View>
        )}

        {result.status === "no-active-anchor" && (
          <View style={styles.card}>
            <Text style={{ color: theme.colors.onSurface }}>
              Server IP was set to {result.ip}. No CA is currently active to
              compare against — import the CA certificate to complete
              provisioning.
            </Text>
          </View>
        )}

        {result.status === "match" && (
          <View style={styles.card}>
            <Text style={{ color: theme.colors.onSurface }}>
              Server IP set to {result.ip}. Scanned fingerprint matches the
              active CA.
            </Text>
          </View>
        )}

        <Button
          mode="outlined"
          onPress={handleScanAgain}
          disabled={isScanning}
          style={styles.button}
        >
          Scan Again
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cameraWrapper: {
    flex: 1,
    margin: 16,
    borderRadius: 20,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  permissionState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  resultArea: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontWeight: "600",
  },
  button: {
    marginTop: 4,
  },
});

export default ProvisioningQrScanner;
