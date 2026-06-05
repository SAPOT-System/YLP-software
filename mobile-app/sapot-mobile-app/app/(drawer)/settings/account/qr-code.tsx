import { useAppMode } from "@/features/shared/context/app-mode-context";
import { useUserProfile } from "@/features/shared/hooks";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { QRPayload } from "@/features/shared/types";
import { uiLog } from "@/features/shared/utils/logger";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";
import { Text, useTheme } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";

export default function QrCodeScreen() {
  const theme = useTheme();
  const { user } = useUserProfile();
  const container = useMainContainer();
  const { mode } = useAppMode();

  useEffect(() => {
    uiLog.info("[QrCode] mounted");
    return () => {
      uiLog.info("[QrCode] unmounted");
    };
  }, []);

  const isNetworkReady =
    mode === "server" || Boolean(container.networkConfig.ipAddress);

  const qrValue = useMemo(() => {
    if (!user) return "";
    const payload: QRPayload = {
      id: user.id,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      username: user.username,
      ...(mode !== "server" && {
        ip: container.networkConfig.ipAddress,
        port: container.networkConfig.port,
      }),
    };
    return JSON.stringify(payload);
  }, [user, mode, container.networkConfig.ipAddress, container.networkConfig.port]);

  if (!user) return <LoadingSpinner />;

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 24,
        }}
      >
        {isNetworkReady ? (
          <View
            style={{
              padding: 20,
              borderRadius: 20,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              gap: 16,
            }}
          >
            <QRCode value={qrValue} size={220} />
            <Text variant="titleMedium">{displayName}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
              {mode === "server" ? "Server mode" : container.networkConfig.ipAddress}
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: "center", gap: 12 }}>
            <LoadingSpinner />
            <Text style={{ color: theme.colors.onSurface }}>
              Waiting for network...
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
