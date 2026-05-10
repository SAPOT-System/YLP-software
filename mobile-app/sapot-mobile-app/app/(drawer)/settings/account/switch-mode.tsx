import { useAppMode } from "@/features/shared/context";
import {
  useConnectionService,
  useDiscoveryService,
  useUserProfile,
} from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { RadioButton, Text, useTheme } from "react-native-paper";

export default function SwitchMode() {
  const theme = useTheme();
  const { mode, setMode, store } = useAppMode();
  const { isGuest } = useUserProfile();
  const connectionService = useConnectionService();
  const discoveryService = useDiscoveryService();

  useEffect(() => {
    uiLog.info("[SwitchMode] mounted");
    return () => {
      uiLog.info("[SwitchMode] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[SwitchMode] useEffect triggered, deps:", {
      mode,
      isGuest,
    });
  }, [mode, isGuest]);

  const allowedModes: Array<"auto" | "server" | "lan"> = isGuest
    ? ["lan"]
    : ["auto", "server", "lan"];
  const effectiveMode = store.getEffectiveMode(isGuest);

  const modeLabels: Record<"auto" | "server" | "lan", string> = {
    auto: "Auto",
    server: "Server",
    lan: "LAN",
  };

  const applyMode = async (nextMode: "auto" | "server" | "lan") => {
    uiLog.debug("[SwitchMode] applyMode called", { nextMode });
    if (mode === nextMode) return;
    const prevMode = mode;
    setMode(nextMode);

    const allowZeroconf = store.isZeroconfAllowed(isGuest);
    const allowTcp = store.isTcpAllowed(isGuest);

    if (allowZeroconf) {
      if (prevMode === "lan" && nextMode === "auto") return;
      if (prevMode === "auto" && nextMode === "lan") return;
      uiLog.info("[SwitchMode] enabling zeroconf", prevMode, nextMode);
      try {
        await discoveryService.publishDevice();
      } catch (error: any) {
        uiLog.error("[SwitchMode] failed to publish discovery service", {
          error: error.message,
        });
      }
      discoveryService.startDiscovery();
    } else {
      uiLog.info("[SwitchMode] disabling zeroconf");
      discoveryService.stopDiscovery();
      await discoveryService.destroy();
    }

    if (allowTcp) {
      if (prevMode === "lan" && nextMode === "auto") return;
      if (prevMode === "auto" && nextMode === "lan") return;
      uiLog.info("[SwitchMode] enabling tcp transport", prevMode, nextMode);
      connectionService.start();
    } else {
      uiLog.info("[SwitchMode] disabling tcp transport");
      connectionService.stopTcpTransport();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <RadioButton.Group
          onValueChange={(value) => {
            void applyMode(value as "auto" | "server" | "lan");
          }}
          value={effectiveMode}
        >
          {allowedModes.map((allowedMode) => (
            <View
              key={allowedMode}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <RadioButton value={allowedMode} />
              <Text>{modeLabels[allowedMode]} Mode</Text>
            </View>
          ))}
        </RadioButton.Group>
        {!store.isModeAllowed(mode, isGuest) && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.error, marginTop: 12 }}
          >
            Selected mode is not available for your account. We switched you to{" "}
            {effectiveMode.toUpperCase()}.
          </Text>
        )}
      </View>
    </View>
  );
}