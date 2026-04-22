import { StyleSheet, View, Text } from "react-native";
import {
  Map,
  Camera,
  RasterSource,
  Layer,
  UserLocation,
} from "@maplibre/maplibre-react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth";
import { useLocationPermission } from "@/features/gps/hooks/useLocationPermission";
import { getTileServerUrl } from "@/config/runtime";

const TILE_URL = `${getTileServerUrl()}/styles/basic-preview/{z}/{x}/{y}.png`;

const EMPTY_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [],
};

export default function GpsScreen() {
  const { isAuthenticated, isRescuer } = useAuth();
  const insets = useSafeAreaInsets();
  const locationGranted = useLocationPermission();

  if (!isAuthenticated || !isRescuer) {
    return <Redirect href="/(drawer)/(tabs)" />;
  }

  if (locationGranted === null) {
    return (
      <View style={styles.center}>
        <Text>Requesting location permission…</Text>
      </View>
    );
  }

  if (locationGranted === false) {
    return (
      <View style={styles.center}>
        <Text>Location permission denied. Enable it in device settings.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Map style={styles.map} mapStyle={EMPTY_STYLE}>
        <Camera trackUserLocation="default" zoom={14} />
        <RasterSource
          id="tileserver"
          tiles={[TILE_URL]}
          tileSize={256}
          minzoom={0}
          maxzoom={18}
        >
          <Layer
            id="tileserver-layer"
            type="raster"
            source="tileserver"
          />
        </RasterSource>
        <UserLocation animated />
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
