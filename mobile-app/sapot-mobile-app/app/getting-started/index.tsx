import {
  ModeSelect,
  ScreenContent,
  ScreenHeader,
} from "@/features/getting-started";
import { useCheckConnection } from "@/features/shared/hooks";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { Button } from "react-native-paper";
import { LoadingOverlay } from "@/features/shared";
import { useLoadingOverlay } from "@/features/shared/hooks";
import { AUTH_ROUTES } from "../routes";

const ModeSelectScreen = () => {
  const router = useRouter();
  const { checkBackendConnection, loading: checkingConnection } =
    useCheckConnection();
  const [selectedMode, setSelectedMode] = useState<"server" | "lan" | null>(
    null
  );
  const {
    loading,
    loadingMessage,
    showLoading,
    hideLoading,
    setLoadingMessage,
  } = useLoadingOverlay();

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Getting Started" />
      <ScreenContent
        title="Mode Select"
        description="Choose how you want to tuse the application"
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            width: "100%",
            alignItems: "stretch",
            marginBottom: 40,
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
        <Button
          mode="contained"
          onPress={async () => {
            if (!selectedMode) return;
            if (selectedMode === "server") {
              showLoading("Connecting...");
              const result = await checkBackendConnection();
              if (result === true) {
                setLoadingMessage("Connected! Redirecting...");
                setTimeout(() => {
                  hideLoading();
                  router.push(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
                }, 700);
              } else {
                setLoadingMessage("Connection failed. Please try again.");
                setTimeout(() => hideLoading(), 1200);
              }
            }
            if (selectedMode === "lan") {
              showLoading("Preparing LAN login...");
              setTimeout(() => {
                hideLoading();
                router.push(AUTH_ROUTES.LOGIN.LAN_LOGIN);
              }, 700);
            }
          }}
          style={{
            width: "100%",
            opacity: selectedMode ? 1 : 0.5,
          }}
        >
          Proceed
        </Button>
      </ScreenContent>
      <LoadingOverlay
        visible={loading || checkingConnection}
        text={loadingMessage}
      />
    </View>
  );
};

export default ModeSelectScreen;
