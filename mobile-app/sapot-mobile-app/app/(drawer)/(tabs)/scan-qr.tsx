import { uiLog } from "@/features/shared/utils/logger";
import { Camera, CameraView, type BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

type ScanState = {
  data: string | null;
  type: string | null;
};

export default function QRScannerScreen() {
  const theme = useTheme();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanState, setScanState] = useState<ScanState>({
    data: null,
    type: null,
  });
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    uiLog.info("[QRScannerScreen] mounted");
    let isMounted = true;
    const requestPermission = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (isMounted) {
        setHasPermission(status === "granted");
      }
    };
    requestPermission();
    return () => {
      uiLog.info("[QRScannerScreen] unmounted");
      isMounted = false;
    };
  }, []);

  const handleBarcodeScanned = ({ data, type }: BarcodeScanningResult) => {
    uiLog.info("[QRScannerScreen] barcode scanned", { type });
    setIsScanning(false);
    setScanState({ data, type });
  };

  const handleScanAgain = () => {
    uiLog.debug("[QRScannerScreen] handleScanAgain called");
    setScanState({ data: null, type: null });
    setPickedImageUri(null);
    setIsScanning(true);
  };

  const handlePickImage = async () => {
    uiLog.debug("[QRScannerScreen] handlePickImage called");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled) {
      uiLog.info("[QRScannerScreen] image pick canceled");
      return;
    }

    const imageUri = result.assets[0]?.uri ?? null;
    setPickedImageUri(imageUri);

    if (!imageUri) {
      return;
    }

    const decoded = await Camera.scanFromURLAsync(imageUri, ["qr"]);

    if (decoded.length > 0) {
      uiLog.info("[QRScannerScreen] qr decoded", {
        type: decoded[0].type,
      });
      setIsScanning(false);
      setScanState({ data: decoded[0].data, type: decoded[0].type });
    } else {
      uiLog.warn("[QRScannerScreen] no qr found in image");
      setScanState({
        data: "No QR code found in this image.",
        type: "image",
      });
    }
  };

  const statusText = useMemo(() => {
    if (hasPermission === null) {
      return "Requesting camera permission...";
    }
    if (hasPermission === false) {
      return "Camera access denied. Please enable it in settings.";
    }
    return null;
  }, [hasPermission]);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {hasPermission ? (
        <View style={styles.cameraWrapper}>
          <CameraView
            style={styles.camera}
            facing={"back"}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
          />
          <View style={styles.overlay}>
            <View style={styles.frame} />
            <Text
              style={[styles.overlayText, { color: theme.colors.onSurface }]}
            >
              Align QR code within the frame
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.permissionState}>
          <Text style={{ color: theme.colors.onSurface }}>{statusText}</Text>
        </View>
      )}

      <View style={styles.actionArea}>
        {scanState.data ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Scanned QR</Text>
            <Text style={styles.resultText}>{scanState.data}</Text>
          </View>
        ) : (
          <Text style={styles.helperText}>Waiting for a QR code...</Text>
        )}

        {pickedImageUri ? (
          <Image source={{ uri: pickedImageUri }} style={styles.previewImage} />
        ) : null}

        <View style={styles.buttonRow}>
          <Button
            mode="contained"
            onPress={handlePickImage}
            style={styles.button}
          >
            Pick Image
          </Button>
          <Button
            mode="outlined"
            onPress={handleScanAgain}
            style={styles.button}
            disabled={isScanning}
          >
            Scan Again
          </Button>
        </View>
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
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  frame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderRadius: 24,
    borderColor: "rgba(255, 255, 255, 0.9)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  overlayText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "600",
  },
  permissionState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  actionArea: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  resultCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6B6B6B",
    marginBottom: 6,
  },
  resultText: {
    fontSize: 16,
    fontWeight: "600",
  },
  helperText: {
    marginBottom: 12,
    color: "#6B6B6B",
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
  },
});
