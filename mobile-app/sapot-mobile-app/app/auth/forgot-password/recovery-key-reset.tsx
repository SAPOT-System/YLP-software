import { AUTH_ROUTES } from "@/config/routes";
import {
    ExpoFileUpload,
    FileUploadResultCard,
    PrimaryButton,
    SecondaryButton,
    StepDots,
    useVerifyRecoveryKey,
} from "@/features/auth";
import { canResetPasswordApi } from "@/features/auth/api/auth.api";
import { extractResetToken } from "@/features/auth/utils";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { FailedDialog } from "@/features/shared/components/failed-dialog";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useDialogVisibility, useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { pick } from "@react-native-documents/picker";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { HelperText } from "react-native-paper";

const RecoveryKeyResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const insertFailedDialog = useDialogVisibility();

  const [file, setFile] = useState<ExpoFileUpload>();
  const [checkingStoredToken, setCheckingStoredToken] = useState(true);

  const { loading, error, verifyRecoveryKey } = useVerifyRecoveryKey(identifier);
  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showError, hideToast } = useToast();

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
        const storedIdentifier = await getItemAsync("reset_password_identifier");

        if (!storedToken || !storedIdentifier) return;
        if (storedIdentifier !== identifier) return;

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
        authLog.error("[RecoveryKeyResetScreen] Error in check stored token", { error });
        await deleteItemAsync("reset_password_token");
        await deleteItemAsync("reset_password_identifier");
      } finally {
        setCheckingStoredToken(false);
      }
    };

    checkStoredToken();
  }, [identifier]);

  if (checkingStoredToken) {
    return (
      <View style={{ flex: 1 }}>
        <LoadingOverlay visible />
      </View>
    );
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
      showError("Cannot reach server. Please check your connection.");
      return;
    }

    const res = await verifyRecoveryKey(file);

    if (res.success && res.resetLink) {
      const token = extractResetToken(res.resetLink);

      // Read the recovery key hex from the file so the recovery hook can unwrap the blob
      let keyHex = "";
      try {
        const fileRes = await fetch(file.uri);
        keyHex = (await fileRes.text()).trim();
      } catch { /* non-fatal — recovery will be skipped */ }

      await Promise.all([
        setItemAsync("reset_recovery_token", res.recoveryToken ?? ""),
        setItemAsync("reset_recovery_secret", keyHex),
      ]);

      authLog.info("[Navigation] Navigating to ResetPassword", {
        screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
      });
      router.push({
        pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
        params: { token, identifier, method: "token" },
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
      <StepDots total={3} current={2} />
      <ScreenContent
        title="Upload Recovery Key"
        description="Recovery key was provided when you first created your account. Check your Downloads folder or saved files from when you registered."
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
        >
          <HelperText type="error" visible={!!error.general}>{error.general}</HelperText>
          <SecondaryButton onPress={handleFileUpload} disabled={!!file}>
            Choose File
          </SecondaryButton>
          <HelperText type="error" visible={!!error.recoveryKey}>{error.recoveryKey}</HelperText>
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
          disabled={!file || loading}
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
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </View>
  );
};

export default RecoveryKeyResetScreen;
