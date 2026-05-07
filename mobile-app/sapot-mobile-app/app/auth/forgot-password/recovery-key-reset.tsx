import { AUTH_ROUTES } from "@/config/routes";
import {
  ExpoFileUpload,
  FileUploadResultCard,
  PrimaryButton,
  SecondaryButton,
  useVerifyRecoveryKey,
} from "@/features/auth";
import { canResetPasswordApi } from "@/features/auth/api/auth.api";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { FailedDialog } from "@/features/shared/components/failed-dialog";
import { useDialogVisibility } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { pick } from "@react-native-documents/picker";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import { useToast } from "@/features/shared/hooks";
import { checkBackEndHealth } from "@/features/shared/api";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { ActivityIndicator, HelperText, Snackbar } from "react-native-paper";

const RecoveryKeyResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  // Dialog
  const insertFailedDialog = useDialogVisibility();

  const [file, setFile] = useState<ExpoFileUpload>();
  const [checkingStoredToken, setCheckingStoredToken] = useState(true);

  const { loading, error, verifyRecoveryKey } =
    useVerifyRecoveryKey(identifier);
  const { visible: toastVisible, message: toastMessage, showToast, hideToast } = useToast();

  useEffect(() => {
    authLog.info("[RecoveryKeyResetScreen] mounted");
    return () => {
      authLog.info("[RecoveryKeyResetScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    const checkStoredToken = async () => {
      try {
        const storedToken = await getItemAsync("reset_password_token");
        const storedIdentifier = await getItemAsync(
          "reset_password_identifier"
        );

        if (!storedToken || !storedIdentifier) {
          return;
        }

        if (storedIdentifier !== identifier) {
          return;
        }

        const isValid = await canResetPasswordApi(storedToken);

        if (isValid) {
          authLog.info("[Navigation] Navigating to ResetPassword", {
            screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
          });
          router.replace({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
            params: { token: storedToken, identifier: storedIdentifier },
          });
        } else {
          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
        }
      } catch (error) {
        authLog.error("[RecoveryKeyResetScreen] Error in check stored token", {
          error,
        });
        await deleteItemAsync("reset_password_token");
        await deleteItemAsync("reset_password_identifier");
      } finally {
        setCheckingStoredToken(false);
      }
    };

    checkStoredToken();
  }, [identifier]);

  if (checkingStoredToken) {
    return <ActivityIndicator />;
  }

  const handleFileUpload = async () => {
    insertFailedDialog.hide();
    authLog.debug("auth › recovery key file select", {
      hasExistingFile: Boolean(file),
    });
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
      authLog.error("auth › recovery key file pick failed", { error });
    }
  };

  const handleVerify = async () => {
    authLog.debug("[RecoveryKeyResetScreen] handleVerify called", {
      hasFile: Boolean(file),
    });
    if (!file) return;
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }

    const res = await verifyRecoveryKey(file);

    if (res.success && res.resetLink) {
      const token = res.resetLink.split("token=")[1];

      authLog.info("[Navigation] Navigating to ResetPassword", {
        screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
      });
      router.push({
        pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
        params: { token, identifier },
      });
    }
  };

  const handleDeleteFile = () => {
    authLog.debug("[RecoveryKeyResetScreen] handleDeleteFile called");
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
          style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
        >
          <HelperText type="error">{error.general}</HelperText>
          <SecondaryButton onPress={handleFileUpload} disabled={!!file}>
            Insert File
          </SecondaryButton>
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
          style={{ marginTop: 16 }}
          onPress={() => {
            authLog.info("[Navigation] goBack triggered from RecoveryKeyReset");
            router.back();
          }}
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
      <Snackbar visible={toastVisible} onDismiss={hideToast} duration={3000}>
        {toastMessage}
      </Snackbar>
    </View>
  );
};

export default RecoveryKeyResetScreen;
