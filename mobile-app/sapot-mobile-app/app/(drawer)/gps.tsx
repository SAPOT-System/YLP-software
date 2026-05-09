import { getTileServerUrl } from "@/config/runtime";
import { useAuth } from "@/features/auth";
import { ChatRoomSource } from "@/features/chat/types";
import { useLatestLocations } from "@/features/gps/hooks/useLatestLocations";
import { useLocationPermission } from "@/features/gps/hooks/useLocationPermission";
import { useGpsHistory } from "@/features/gps/hooks/useGpsHistory";
import {
  SelectedUser,
  UserMarkerSheet,
} from "@/features/gps/components/UserMarkerSheet";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  RasterSource,
  UserLocation,
} from "@maplibre/maplibre-react-native";
import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Icon,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const theme = useTheme();
  const locationGranted = useLocationPermission();
  const {
    data: rawLocations = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useLatestLocations();

  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [pathUserId, setPathUserId] = useState<string | null>(null);

  const {
    data: historyData,
    isFetching: isPathFetching,
    refetch: fetchPath,
  } = useGpsHistory(pathUserId);

  const currentUserId = userStore.user.id;
  const userLocations = rawLocations.filter(
    (loc) => loc.user_id !== currentUserId
  );
  const isInitialLoading = isLoading && rawLocations.length === 0;
  const showEmptyState =
    locationGranted === true && !isLoading && !isError && userLocations.length === 0;
  const errorMessage =
    error instanceof Error ? error.message : "Unable to load live locations.";
  const headerTitleColor =
    theme.colors.onSecondary ?? (theme.dark ? "#E6ECF5" : "#000");
  const headerIconColor = headerTitleColor;
  const overlayBottom = insets.bottom + 16;

  const pathGeoJSON = useMemo(() => {
    if (!historyData || historyData.length < 2) return null;
    const ordered = [...historyData].reverse();
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: ordered.map((p) => [p.longitude, p.latitude]),
          },
          properties: {},
        },
      ],
    };
  }, [historyData]);

  const handleMessage = (userId: string) => {
    setSelectedUser(null);
    router.push({
      pathname: "/(drawer)/(tabs)/chat/[id]",
      params: { id: userId, source: ChatRoomSource.PEER },
    });
  };

  const handleViewPath = async (userId: string) => {
    setPathUserId(userId);
    await fetchPath();
  };

  const header = (
    <Appbar.Header
      statusBarHeight={0}
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.secondary,
        },
      ]}
    >
      <Appbar.BackAction
        onPress={() => router.back()}
        color={headerIconColor}
      />
      <Appbar.Content
        title="Live Map"
        titleStyle={[styles.headerTitle, {
          color: headerTitleColor
        }]}
      />
    </Appbar.Header>
  );

  const handleOpenSettings = () => {
    Linking.openSettings().catch(() => null);
  };

  if (!isAuthenticated || !isRescuer) {
    return <Redirect href="/(drawer)/(tabs)" />;
  }

  if (locationGranted === null) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {header}
        <View style={styles.stateContainer}>
          <ActivityIndicator
            animating
            size="large"
            color={theme.colors.primary}
          />
          <Text variant="bodyMedium">
            Requesting location permission...
          </Text>
        </View>
      </View>
    );
  }

  if (locationGranted === false) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {header}
        <View style={styles.stateContainer}>
          <Icon source="map-marker-off" size={48} color={theme.colors.error} />
          <Text
            variant="titleMedium"
            style={[styles.stateTitle, { color: theme.colors.onSurface }]}
          >
            Location access denied
          </Text>
          <Text
            variant="bodySmall"
            style={[
              styles.stateBody,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Enable location in your device settings to use the map.
          </Text>
          <Button mode="contained-tonal" onPress={handleOpenSettings}>
            Open Settings
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {header}
      <View style={styles.mapContainer}>
        <Map style={styles.map} mapStyle={EMPTY_STYLE} androidView="texture">
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
              id={String(loc.user_id)}
              lngLat={[loc.longitude, loc.latitude]}
              anchor="bottom"
              onPress={() =>
                setSelectedUser({
                  user_id: loc.user_id,
                  username: loc.username,
                  timestamp: loc.timestamp,
                })
              }
            >
              <View style={styles.marker}>
                <Icon
                  source="map-marker-account"
                  size={32}
                  color={theme.colors.primary}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.markerLabel,
                    {
                      backgroundColor: theme.dark
                        ? "rgba(15,23,42,0.85)"
                        : "rgba(255,255,255,0.95)",
                      color: theme.dark
                        ? theme.colors.onSurface
                        : theme.colors.onSurface,
                      borderColor: theme.colors.outlineVariant,
                    },
                  ]}
                >
                  {loc.username}
                </Text>
              </View>
            </Marker>
          ))}
          {pathGeoJSON && (
            <GeoJSONSource id="user-path-source" data={pathGeoJSON}>
              <Layer
                id="user-path-line"
                type="line"
                paint={{
                  "line-color": "#E53935",
                  "line-width": 3,
                  "line-opacity": 0.85,
                }}
                layout={{
                  "line-cap": "round",
                  "line-join": "round",
                }}
              />
            </GeoJSONSource>
          )}
        </Map>
        {isInitialLoading && (
          <View style={[styles.overlay, { bottom: overlayBottom }]}>
            <View
              style={[
                styles.overlayCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <ActivityIndicator
                animating
                size="small"
                color={theme.colors.primary}
              />
              <Text variant="bodySmall">Fetching live locations...</Text>
            </View>
          </View>
        )}
        {isError && (
          <View style={[styles.overlay, { bottom: overlayBottom }]}>
            <View
              style={[
                styles.overlayCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Icon source="alert-circle-outline" size={20} color={theme.colors.error} />
              <Text variant="bodySmall" style={{ textAlign: "center" }}>
                {errorMessage}
              </Text>
              <Button mode="contained" onPress={() => refetch()} compact>
                Retry
              </Button>
            </View>
          </View>
        )}
        {showEmptyState && !isError && !isInitialLoading && (
          <View
            pointerEvents="none"
            style={[styles.overlay, { bottom: overlayBottom }]}
          >
            <View
              style={[
                styles.overlayCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Icon source="account-group-outline" size={20} color={theme.colors.primary} />
              <Text variant="bodySmall" style={{ textAlign: "center" }}>
                No active rescuers yet. We will show them here when they
                appear.
              </Text>
            </View>
          </View>
        )}
      </View>
      <UserMarkerSheet
        selectedUser={selectedUser}
        onDismiss={() => {
          setSelectedUser(null);
          setPathUserId(null);
        }}
        onMessage={handleMessage}
        onViewPath={handleViewPath}
        hasPath={pathGeoJSON !== null}
        isPathLoading={isPathFetching}
        onClearPath={() => setPathUserId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  header: { height: 80 },
  headerTitle: {
    fontWeight: "bold",
    fontSize: 24,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  stateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  stateTitle: { textAlign: "center" },
  stateBody: { textAlign: "center" },
  overlay: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  overlayCard: {
    width: "100%",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  marker: { alignItems: "center" },
  markerLabel: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 11,
    maxWidth: 120,
  },
});
