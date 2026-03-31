import { saveDocuments } from "@react-native-documents/picker";
import { router } from "expo-router";
import React from "react";
import { Alert } from "react-native";
import { File, Paths } from "expo-file-system";
import { Button } from "react-native-paper";
import { APP_ROUTES } from "@/app/routes";

type DownloadFileButtonProps = {
  fileData: string;
  fileName?: string;
};

const DownloadFileButton: React.FC<DownloadFileButtonProps> = ({
  fileData,
  fileName = "recovery-key.txt",
}) => {
  const handleDownload = async () => {
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
        router.replace(APP_ROUTES.HOME);
      } else {
        Alert.alert("Save cancelled", "No location selected.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Alert.alert("Download failed", error.message || "Unknown error");
    }
  };

  return (
    <Button
      onPress={handleDownload}
      mode="contained"
      accessibilityLabel="Download recovery key file"
    >
      Download
    </Button>
  );
};

export default DownloadFileButton;
