import {
  ModeSelect,
  ScreenContent,
  ScreenHeader,
} from "@/features/getting-started";
import { useCheckConnection } from "@/features/shared/hooks";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { FailedDialog, LoadingOverlay } from "@/features/shared";
import { useLoadingOverlay } from "@/features/shared/hooks";
import { AUTH_ROUTES } from "../routes";
import { PrimaryButton } from "@/features/auth";

const ModeSelectScreen = () => {
  const router = useRouter();
  const { checkBackendConnection, loading: checkingConnection } =
    useCheckConnection();
  const [selectedMode, setSelectedMode] = useState<"server" | "lan" | null>(
    null
  );
  const [isConnectionFailedDialogVisible, setConnectionIsFailedDialogVisible] =
    useState(false);
  const showConnectionFailedDialog = () =>
    setConnectionIsFailedDialogVisible(true);
  const hideConnectionFailedDialog = () =>
    setConnectionIsFailedDialogVisible(false);

  const { loading, loadingMessage, showLoading, hideLoading } =
    useLoadingOverlay();

  const handleProceed = async () => {
    if (!selectedMode) return;
    if (selectedMode === "server") {
      await handleConnectToServer();
    }
    if (selectedMode === "lan") {
      handleUseLanMode();
    }
  };

  const handleUseLanMode = () => {
    hideConnectionFailedDialog();
    hideLoading();
    router.push(AUTH_ROUTES.LOGIN.LAN_LOGIN);
  };

  const handleConnectToServer = async () => {
    hideConnectionFailedDialog();
    showLoading("Connecting to server");
    const result = await checkBackendConnection();
    if (result === true) {
      hideLoading();
      router.push(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
    } else {
      hideLoading();
      showConnectionFailedDialog();
    }
  };

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Getting Started" />
      <ScreenContent
        title="Mode Select"
        description="Choose how you want to use the application, you can change this later in Settings"
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            width: "100%",
            alignItems: "stretch",
            marginBottom: 24,
          }}
        >
          <ModeSelect
            mode="server"
            selected={selectedMode === "server"}
            onPress={() => setSelectedMode("server")}
          />
          <ModeSelect
            mode="lan"
            selected={selectedMode === "lan"}
            onPress={() => setSelectedMode("lan")}
          />
        </View>
        <PrimaryButton
          onPress={handleProceed}
          style={{
            width: "100%",
            opacity: selectedMode ? 1 : 0.5,
          }}
        >
          Proceed
        </PrimaryButton>
      </ScreenContent>
      <LoadingOverlay
        visible={loading || checkingConnection}
        text={loadingMessage}
      />
      <FailedDialog
        type="connectionFailed"
        visible={isConnectionFailedDialogVisible}
        hide={hideConnectionFailedDialog}
        onPrimaryBtnPress={handleConnectToServer}
        onSecondaryBtnPress={handleUseLanMode}
      />
    </View>
  );
};

export default ModeSelectScreen;
