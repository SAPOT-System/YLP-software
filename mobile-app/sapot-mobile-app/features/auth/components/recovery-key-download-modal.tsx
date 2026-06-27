import { authLog } from "@/features/shared/core/utils/logger";
import React from "react";
import { View } from "react-native";
import { Modal, Portal, Text, useTheme } from "react-native-paper";
import DownloadFileButton from "./download-file-button";

interface RecoveryKeyDownloadModalProps {
  visible: boolean;
  fileData: string;
  hideModal: () => void;
  route?: string;
}
const RecoveryKeyDownloadModal = ({
  visible,
  fileData,
  hideModal,
  route,
}: RecoveryKeyDownloadModalProps) => {
  const theme = useTheme();
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={() => {
          authLog.info("[RecoveryKeyDownloadModal] dismissed");
          hideModal();
        }}
        contentContainerStyle={{
          backgroundColor: theme.colors.background,
          padding: 32,
          borderRadius: 10,
        }}
      >
        <Text
          variant="titleLarge"
          style={{
            fontWeight: "bold",
            marginBottom: 8,
            color: theme.colors.inverseOnSurface,
          }}
        >
          Recovery Key
        </Text>
        <Text variant="bodySmall" style={{ marginBottom: 20 }}>
          You can use this to restore your account, keep this somewhere very
          secure.
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.inverseOnSurface, marginBottom: 4 }}
        >
          Your recovery key
        </Text>
        <View
          style={{
            backgroundColor: theme.colors.secondary,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            paddingVertical: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: theme.colors.onSecondary }}>
            recovery-file.txt
          </Text>
        </View>
        <DownloadFileButton
          fileData={fileData}
          route={route}
          onAfterDownload={hideModal}
        />
      </Modal>
    </Portal>
  );
};

export default RecoveryKeyDownloadModal;
