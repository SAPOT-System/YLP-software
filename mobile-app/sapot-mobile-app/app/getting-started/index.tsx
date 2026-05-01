import { AUTH_ROUTES } from "@/config/routes";
import { PrimaryButton } from "@/features/auth";
import {
  ModeSelect,
  ScreenContent,
  ScreenHeader,
} from "@/features/getting-started";
import { navLog } from "@/features/shared";
import { FailedDialog } from "@/features/shared/components/failed-dialog";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useAppMode } from "@/features/shared/context";
import { useCheckConnection, useLoadingOverlay } from "@/features/shared/hooks";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

const ModeSelectScreen = () => {
  const router = useRouter();
  const { setMode } = useAppMode();
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

  useEffect(() => {
    navLog.info("[ModeSelectScreen] mounted");
    return () => {
      navLog.info("[ModeSelectScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    navLog.debug("[ModeSelectScreen] useEffect triggered, deps:", {
      selectedMode,
      checkingConnection,
      loading,
    });
  }, [selectedMode, checkingConnection, loading]);

  const handleProceed = async () => {
    navLog.debug("[ModeSelectScreen] handleProceed called", { selectedMode });
    if (!selectedMode) return;
    if (selectedMode === "server") {
      await handleConnectToServer();
      setMode("server");
    }
    if (selectedMode === "lan") {
      handleUseLanMode();
      setMode("lan");
    }
  };

  const handleUseLanMode = () => {
    hideConnectionFailedDialog();
    hideLoading();
    navLog.info("[Navigation] Navigating to LanLogin", {
      screen: AUTH_ROUTES.LOGIN.LAN_LOGIN,
    });
    router.push(AUTH_ROUTES.LOGIN.LAN_LOGIN);
  };

  const handleConnectToServer = async () => {
    navLog.debug("[ModeSelectScreen] handleConnectToServer called");
    hideConnectionFailedDialog();
    showLoading("Connecting to server");
    const result = await checkBackendConnection();
    if (result === true) {
      hideLoading();
      navLog.info("[Navigation] Navigating to ServerLogin", {
        screen: AUTH_ROUTES.LOGIN.SERVER_LOGIN,
      });
      router.push(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
    } else {
      hideLoading();
      navLog.warn("[ModeSelectScreen] connection check failed");
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
            onPress={() => {
              navLog.debug("[ModeSelectScreen] onPress triggered");
              setSelectedMode("server");
            }}
          />
          <ModeSelect
            mode="lan"
            selected={selectedMode === "lan"}
            onPress={() => {
              navLog.debug("[ModeSelectScreen] onPress triggered");
              setSelectedMode("lan");
            }}
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
