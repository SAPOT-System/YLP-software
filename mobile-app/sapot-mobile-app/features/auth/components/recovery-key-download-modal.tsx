import React from "react";
import { Modal, Portal, Text } from "react-native-paper";
import DownloadFileButton from "./download-file-button";
interface RecoveryKeyDownloadModalProps {
  visible: boolean;
  fileLink: string;
  hideModal: () => void;
}
const RecoveryKeyDownloadModal = ({
  visible,
  fileLink,
  hideModal,
}: RecoveryKeyDownloadModalProps) => {
  //   const [visible, setVisible] = React.useState(false);

  //   const showModal = () => setVisible(true);
  //   const hideModal = () => setVisible(false);
  const containerStyle = { backgroundColor: "white", padding: 20 };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={hideModal}
        contentContainerStyle={containerStyle}
      >
        <Text variant="titleLarge">Recovery Key</Text>
        <Text variant="bodySmall" style={{ marginBottom: 20 }}>
          You can use this to restore your account, keep this somewhere very
          secure.
        </Text>
        <Text variant="bodySmall">Your recovery key</Text>
        <Text>recovery-file.txt</Text>
        <DownloadFileButton url={fileLink} />
      </Modal>
    </Portal>
  );
};

export default RecoveryKeyDownloadModal;
