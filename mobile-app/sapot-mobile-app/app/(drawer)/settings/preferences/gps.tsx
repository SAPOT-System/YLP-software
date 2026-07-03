import { useGpsPreference } from "@/features/gps/context/gps-preference-context";
import { useLocationPermission } from "@/features/gps/hooks/useLocationPermission";
import { uiLog } from "@/features/shared/core/utils/logger";
import { useEffect } from "react";
import { Linking, View } from "react-native";
import { Button, Icon, Switch, Text, useTheme } from "react-native-paper";

export default function GpsSettings() {
  const theme = useTheme();
  const { sharingEnabled, setSharingEnabled } = useGpsPreference();
  const permissionState = useLocationPermission();

  useEffect(() => {
    uiLog.info("[GpsSettings] mounted");
    return () => {
      uiLog.info("[GpsSettings] unmounted");
    };
  }, []);

  const handleOpenSettings = () => {
    Linking.openSettings().catch(() => null);
  };

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
      {sharingEnabled && permissionState === "not-asked" && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Requesting location permission...
          </Text>
        </View>
      )}
      {sharingEnabled && permissionState === "denied" && (
        <View
          style={{
            backgroundColor: theme.colors.background,
            marginHorizontal: 16,
            marginBottom: 16,
            borderRadius: 8,
            padding: 16,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon source="map-marker-off" size={20} color={theme.colors.error} />
            <Text variant="bodyMedium" style={{ color: theme.colors.error, flex: 1 }}>
              Location permission denied
            </Text>
          </View>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Your location can't be shared until you grant location access in
            your device settings.
          </Text>
          <Button mode="contained-tonal" onPress={handleOpenSettings}>
            Open Settings
          </Button>
        </View>
      )}
    </View>
  );
}
