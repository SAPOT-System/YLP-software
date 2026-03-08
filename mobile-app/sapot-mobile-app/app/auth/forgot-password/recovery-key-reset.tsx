import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
} from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { ExpoFileUpload, useVerifyRecoveryKey } from "@/features/auth";
import { pick } from "@react-native-documents/picker";

const RecoveryKeyResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const [file, setFile] = useState<ExpoFileUpload>();

  const getVerifyRecoveryKey = useVerifyRecoveryKey(identifier);

  if (!getVerifyRecoveryKey) {
    return <ActivityIndicator />;
  }

  const { loading, error, verifyRecoveryKey } = getVerifyRecoveryKey;

  const handleFileUpload = async () => {
    try {
      const [pickedFile] = await pick();

      if (pickedFile.name && pickedFile.type) {
        console.log("pickedFile", pickedFile.name);
        setFile({
          uri: pickedFile.uri,
          name: pickedFile.name,
          type: pickedFile.type,
        });
      } else {
        console.log("invalid file");
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
        pathname: "/getting-started/reset-password",
        params: { token, identifier },
      });
    }
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
          <Button mode="contained" onPress={handleFileUpload}>
            Insert File
          </Button>
          <HelperText type="error">{error.recoveryKey}</HelperText>
          {file && (
            <Text>
              {file.name} {file.type} {file.uri}
            </Text>
          )}
        </View>
        <Button
          mode="contained"
          style={{ width: 280 }}
          onPress={handleVerify}
          loading={loading}
          disabled={loading}
        >
          Verify
        </Button>
      </ScreenContent>
    </View>
  );
};

export default RecoveryKeyResetScreen;
