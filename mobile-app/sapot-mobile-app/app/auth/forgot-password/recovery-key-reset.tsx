import { AUTH_ROUTES } from "@/config/routes";
import {
    ExpoFileUpload,
    FileUploadResultCard,
    PrimaryButton,
    SecondaryButton,
    StepDots,
    useVerifyRecoveryKey,
} from "@/features/auth";
import { AttemptsWarning } from "@/features/auth/components/attempts-warning";
import { LockoutBanner } from "@/features/auth/components/lockout-banner";
import { canResetPasswordApi } from "@/features/auth/api/auth.api";
import { extractResetToken } from "@/features/auth/utils";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/core/api";
import { FailedDialog } from "@/features/shared/components/failed-dialog";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useDialogVisibility } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/core/utils/logger";
import { pick } from "@react-native-documents/picker";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

const RecoveryKeyResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const insertFailedDialog = useDialogVisibility();

  const [file, setFile] = useState<ExpoFileUpload>();
  const [checkingStoredToken, setCheckingStoredToken] = useState(true);

  const { error, verifyRecoveryKey, lockout, attemptsRemaining } = useVerifyRecoveryKey(identifier);
  const [overlayPhase, setOverlayPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [overlayMessage, setOverlayMessage] = useState("");
  const pendingNavRef = useRef<(() => void) | null>(null);
  const submittingRef = useRef(false);

  const handleOverlayDismiss = useCallback(() => {
    if (overlayPhase === "success" && pendingNavRef.current) {
      pendingNavRef.current();
    }
    setOverlayPhase("idle");
    setOverlayMessage("");
  }, [overlayPhase]);

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

        if (isValid.valid) {
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

  const handleVerify = async (): Promise<void> => {
    if (submittingRef.current || lockout.isLocked) return;
    submittingRef.current = true;
    try {
    authLog.debug("[RecoveryKeyResetScreen] handleVerify called", {
      hasFile: Boolean(file),
    });
    if (!file) return;
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      setOverlayPhase("error");
      setOverlayMessage("Cannot reach server. Please check your connection.");
      return;
    }

    setOverlayPhase("loading");
    setOverlayMessage("");

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
      pendingNavRef.current = () =>
        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
          params: { token, identifier, method: "token" },
        });
      setOverlayPhase("success");
      setOverlayMessage("Recovery key verified!");
    } else {
      setOverlayPhase("error");
      setOverlayMessage(error.general || error.recoveryKey || "Verification failed. Please try again.");
    }
    } finally {
      submittingRef.current = false;
    }
  };

  const handleDeleteFile = () => {
    authLog.debug("[RecoveryKeyResetScreen] handleDeleteFile called");
    setFile(undefined);
  };

  const isSubmitting = overlayPhase !== "idle";

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      bounces={false}
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
    >
    <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}>
      <LoadingOverlay
        visible={isSubmitting}
        text="Verifying…"
        status={overlayPhase !== "idle" ? overlayPhase : "loading"}
        statusMessage={overlayMessage}
        onDismiss={handleOverlayDismiss}
      />
      <ScreenHeader headerName="Resetting Password" />
      <StepDots total={3} current={2} />
      <ScreenContent
        title="Upload Recovery Key"
        description="Recovery key was provided when you first created your account. Check your Downloads folder or saved files from when you registered."
      >
        {lockout.isLocked && (
          <LockoutBanner
            secondsRemaining={lockout.secondsRemaining}
            deviceType={lockout.deviceType}
            onExpire={lockout.clearLock}
          />
        )}
        {!lockout.isLocked && attemptsRemaining !== null && (
          <AttemptsWarning attemptsRemaining={attemptsRemaining} />
        )}
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
        >
          <SecondaryButton onPress={handleFileUpload} disabled={!!file || isSubmitting}>
            Choose File
          </SecondaryButton>
          {file && (
            <FileUploadResultCard
              fileName={file.name}
              onDelete={handleDeleteFile}
            />
          )}
        </View>
        <PrimaryButton
          onPress={handleVerify}
          loading={overlayPhase === "loading"}
          disabled={!file || isSubmitting || lockout.isLocked}
        >
          {overlayPhase === "loading" ? "Verifying…" : "Verify"}
        </PrimaryButton>
        <SecondaryButton
          style={{ marginTop: 16 }}
          onPress={() => {
            authLog.info("[Navigation] goBack triggered from RecoveryKeyReset");
            router.back();
          }}
          disabled={isSubmitting}
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
    </KeyboardAwareScrollView>
  );
};

export default RecoveryKeyResetScreen;
