import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import React from "react";
import { Alert } from "react-native";
import { Button } from "react-native-paper";

type DownloadFileButtonProps = {
  fileData: ArrayBuffer;
  fileName?: string;
};

const DownloadFileButton: React.FC<DownloadFileButtonProps> = ({
  fileData,
  fileName = "recovery-key.txt",
}) => {
  const handleDownload = async () => {
    try {
      // Decode fileData to string
      let fileContent: string;
      if (typeof Buffer !== "undefined") {
        fileContent = Buffer.from(fileData).toString("utf8");
      } else {
        fileContent = String.fromCharCode(...new Uint8Array(fileData));
      }

      // Create file instance and write content
      const file = new File(Paths.document, fileName);
      await file.write(fileContent, { encoding: "utf8" });

      Alert.alert("Download complete", `Saved to: ${file.uri}`);
      router.replace("/(drawer)/(tabs)");
    } catch (error: any) {
      console.error(error);
      Alert.alert("Download failed", error?.message || "Unknown error");
    }
  };

  return (
    <Button
      mode="contained"
      onPress={handleDownload}
      accessibilityLabel="Download recovery key file"
    >
      Download Recovery Key
    </Button>
  );
};

export default DownloadFileButton;
