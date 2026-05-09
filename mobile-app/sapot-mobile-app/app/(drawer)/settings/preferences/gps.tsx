import { useGpsPreference } from "@/features/gps/context/gps-preference-context";
import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Switch, Text, useTheme } from "react-native-paper";

export default function GpsSettings() {
  const theme = useTheme();
  const { sharingEnabled, setSharingEnabled } = useGpsPreference();

  useEffect(() => {
    uiLog.info("[GpsSettings] mounted");
    return () => {
      uiLog.info("[GpsSettings] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View
        style={{
          backgroundColor: theme.colors.background,
          margin: 16,
          borderRadius: 8,
          padding: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="titleMedium">Share Location</Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Send your GPS coordinates to rescuers in real time
          </Text>
        </View>
        <Switch value={sharingEnabled} onValueChange={setSharingEnabled} />
      </View>
    </View>
  );
}
