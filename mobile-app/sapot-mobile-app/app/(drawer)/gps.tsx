import { StyleSheet, View, Text } from "react-native";
import {
  Map,
  Camera,
  RasterSource,
  Layer,
  UserLocation,
  Marker,
} from "@maplibre/maplibre-react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "react-native-paper";
import { useAuth } from "@/features/auth";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { useLocationPermission } from "@/features/gps/hooks/useLocationPermission";
import { useLatestLocations } from "@/features/gps/hooks/useLatestLocations";
import { getTileServerUrl } from "@/config/runtime";

const TILE_URL = `${getTileServerUrl()}/styles/basic-preview/{z}/{x}/{y}.png`;

const EMPTY_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [],
};

export default function GpsScreen() {
  const { isAuthenticated, isRescuer } = useAuth();
  const userStore = useUserStore();
  const insets = useSafeAreaInsets();
  const locationGranted = useLocationPermission();
  const { data: rawLocations = [] } = useLatestLocations();
  const currentUserId = userStore.user.id;
  const userLocations = rawLocations.filter((loc) => loc.user_id !== currentUserId);

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
          <Layer id="tileserver-layer" type="raster" source="tileserver" />
        </RasterSource>
        <UserLocation animated />
        {userLocations.map((loc) => (
          <Marker
            key={loc.user_id}
            id={loc.user_id}
            lngLat={[loc.longitude, loc.latitude]}
            anchor="bottom"
          >
            <View style={styles.marker}>
              <Icon source="map-marker-account" size={32} color="#E53935" />
              <Text style={styles.markerLabel}>{loc.username}</Text>
            </View>
          </Marker>
        ))}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  marker: { alignItems: "center" },
  markerLabel: {
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#fff",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 11,
  },
});
