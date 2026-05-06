import { useThrottledPress } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { saveDocuments } from "@react-native-documents/picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import React, { useCallback } from "react";
import { Alert } from "react-native";
import { Button } from "react-native-paper";

type DownloadFileButtonProps = {
  fileData: string;
  fileName?: string;
  route?: string;
  onAfterDownload?: () => void;
};

const DownloadFileButton: React.FC<DownloadFileButtonProps> = ({
  fileData,
  fileName = "recovery-key.txt",
  route,
  onAfterDownload,
}) => {
  const handleDownload = useCallback(async () => {
    authLog.debug("[DownloadFileButton] handleDownload called", {
      hasFileData: Boolean(fileData),
      fileName,
    });
    try {
      // Create file instance and write content
      const file = new File(Paths.document, fileName);
      await file.write(fileData, { encoding: "utf8" });

      // Let user pick location and save
      const [{ uri: targetUri }] = await saveDocuments({
        sourceUris: [file.uri],
        copy: false,
        mimeType: "text/plain",
        fileName,
      });

      if (targetUri) {
        Alert.alert("File saved");
        onAfterDownload?.();
        authLog.info("[Navigation] Navigating", { screen: route });
        if (route) router.replace(route as never);
      } else {
        Alert.alert("Save cancelled", "No location selected.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      authLog.error("[DownloadFileButton] Error in download", { error });
      Alert.alert("Download failed", error.message || "Unknown error");
    }
  }, [fileData, fileName, route, onAfterDownload]);

  const { onPress: throttledDownload, busy } = useThrottledPress(handleDownload);

  return (
    <Button
      onPress={throttledDownload}
      loading={busy}
      disabled={busy}
      mode="contained"
      accessibilityLabel="Download recovery key file"
    >
      Download
    </Button>
  );
};

export default DownloadFileButton;
