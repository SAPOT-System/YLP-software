import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { ActivityIndicator, Button, HelperText } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import {
  ExpoFileUpload,
  FileUploadResultCard,
  PrimaryButton,
  SecondaryButton,
  useVerifyRecoveryKey,
} from "@/features/auth";
import { pick } from "@react-native-documents/picker";
import { AUTH_ROUTES } from "@/app/routes";
import { FailedDialog } from "@/features/shared";
import { useDialogVisibility } from "@/features/shared/hooks";

const RecoveryKeyResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  // Dialog
  const insertFailedDialog = useDialogVisibility();

  const [file, setFile] = useState<ExpoFileUpload>();

  const getVerifyRecoveryKey = useVerifyRecoveryKey(identifier);

  if (!getVerifyRecoveryKey) {
    return <ActivityIndicator />;
  }

  const { loading, error, verifyRecoveryKey } = getVerifyRecoveryKey;

  const handleFileUpload = async () => {
    insertFailedDialog.hide();
    console.log(file);
    try {
      const [pickedFile] = await pick();

      if (pickedFile.name && pickedFile.type === "text/plain") {
        setFile({
          uri: pickedFile.uri,
          name: pickedFile.name,
          type: pickedFile.type,
        });
      } else {
        insertFailedDialog.show();
      }
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const handleVerify = async () => {
    if (!file) return;

    const res = await verifyRecoveryKey(file);

    if (res.success && res.resetLink) {
      const token = res.resetLink.split("token=")[1];

      router.push({
        pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
        params: { token, identifier },
      });
    }
  };

  const handleDeleteFile = () => {
    setFile(undefined);
  };

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Upload Recovery Key"
        description="Recovery key was provided when you first created your account"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          <HelperText type="error">{error.general}</HelperText>
          <Button mode="contained" onPress={handleFileUpload} disabled={!!file}>
            Insert File
          </Button>
          <HelperText type="error">{error.recoveryKey}</HelperText>
          {file && (
            <FileUploadResultCard
              fileName={file.name}
              onDelete={handleDeleteFile}
            />
          )}
        </View>
        <PrimaryButton
          onPress={handleVerify}
          loading={loading}
          disabled={loading}
        >
          Verify
        </PrimaryButton>
        <SecondaryButton
          mode="outlined"
          style={{ width: 280, marginTop: 16 }}
          onPress={() => router.back()}
          disabled={loading}
        >
          Back
        </SecondaryButton>
      </ScreenContent>
      <FailedDialog
        type="fileUploadFailed"
        onPrimaryBtnPress={handleFileUpload}
        onSecondaryBtnPress={insertFailedDialog.hide}
        visible={insertFailedDialog.visible}
        hide={insertFailedDialog.hide}
      />
    </View>
  );
};

export default RecoveryKeyResetScreen;
