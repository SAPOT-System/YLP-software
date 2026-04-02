import { useAppMode } from "@/features/shared/context";
import {
  useConnectionService,
  useDiscoveryService,
  useUserProfile,
} from "@/features/shared/hooks";
import { View } from "react-native";
import { RadioButton, Text, useTheme } from "react-native-paper";

export default function SwitchMode() {
  const theme = useTheme();
  const { mode, setMode, store } = useAppMode();
  const { isGuest } = useUserProfile();
  const connectionService = useConnectionService();
  const discoveryService = useDiscoveryService();

  const allowedModes: Array<"auto" | "server" | "lan"> = isGuest
    ? ["lan"]
    : ["auto", "server", "lan"];
  const effectiveMode = store.getEffectiveMode(isGuest);

  const modeLabels: Record<"auto" | "server" | "lan", string> = {
    auto: "Auto",
    server: "Server",
    lan: "LAN",
  };

  const applyMode = (nextMode: "auto" | "server" | "lan") => {
    if (mode === nextMode) return;
    setMode(nextMode);

    const allowZeroconf = store.isZeroconfAllowed(isGuest);
    const allowTcp = store.isTcpAllowed(isGuest);

    if (allowZeroconf) {
      discoveryService.publishDevice();
      discoveryService.startDiscovery();
    } else {
      discoveryService.stopDiscovery();
      discoveryService.destroy();
    }

    if (allowTcp) {
      connectionService.start();
    } else {
      connectionService.stopTcpTransport();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <RadioButton.Group
          onValueChange={(value) => applyMode(value as "auto" | "server" | "lan")}
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
            Selected mode is not available for your account. We switched you to
            {" "}
            {effectiveMode.toUpperCase()}.
          </Text>
        )}
      </View>
    </View>
  );
}
