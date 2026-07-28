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
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { getGpsHistoryApi } from "@/features/gps/api/gps.api";
import { useQueryClient } from "@tanstack/react-query";
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
import { Linking, Pressable, StyleSheet, View } from "react-native";
import {
  Button,
  Icon,
  Text,
  useTheme,
} from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const locationPermission = useLocationPermission();
  // Computed here, not at module scope: getTileServerUrl() reads
  // _hostOverride, which only finishes loading (initRuntimeOverrides())
  // after AuthContainerProvider unblocks rendering — see
  // features/auth/context/auth-container-context.tsx. A module-level
  // constant would snapshot the pre-override (often undefined) host.
  const tileUrl = useMemo(
    () => `${getTileServerUrl()}/styles/basic-preview/{z}/{x}/{y}.png`,
    [],
  );
  const {
    data: rawLocations = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useLatestLocations();

  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [pathUserId, setPathUserId] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(false);
  const [isPathFetching, setIsPathFetching] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [pathMode, setPathMode] = useState(false);
  const [showNoHistoryBanner, setShowNoHistoryBanner] = useState(false);
  const { visible, message, variant, showError, hideToast } = useToast();

  const { data: historyData } = useGpsHistory(pathUserId);

  const currentUserId = userStore.user.id;
  const userLocations = rawLocations.filter(
    (loc) => loc.user_id !== currentUserId
  );
  const isInitialLoading = isLoading && rawLocations.length === 0;
  const showEmptyState =
    locationPermission === "granted" &&
    !isLoading &&
    !isError &&
    userLocations.length === 0;
  const errorMessage =
    error instanceof Error ? error.message : "Unable to load live locations.";
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

  const pathEndpoints = useMemo(() => {
    if (!historyData || historyData.length < 1) return null;
    const ordered = [...historyData].reverse();
    return {
      oldest: [ordered[0].longitude, ordered[0].latitude] as [number, number],
      newest: [
        ordered[ordered.length - 1].longitude,
        ordered[ordered.length - 1].latitude,
      ] as [number, number],
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
    setFollowUser(false);
    setIsPathFetching(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["gps", "history", userId],
        queryFn: () => getGpsHistoryApi(userId),
        staleTime: 30_000,
      });
      if (data.length < 2) {
        setShowNoHistoryBanner(true);
        return;
      }
      setPathUserId(userId);
      setShowPath(true);
    } catch {
      showError("Could not load path. Please try again.");
    } finally {
      setIsPathFetching(false);
    }
  };

  const clearPath = () => {
    setPathUserId(null);
    setShowPath(false);
    setShowNoHistoryBanner(false);
  };

  const handleRecenter = () => {
    setFollowUser(true);
  };

  const handleOpenSettings = () => {
    Linking.openSettings().catch(() => null);
  };

  if (!isAuthenticated || !isRescuer) {
    return <Redirect href="/(drawer)/(tabs)" />;
  }

  if (locationPermission === "not-asked") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.stateContainer}>
          <LoadingSpinner size="large" />
          <Text variant="bodyMedium">Requesting location permission...</Text>
        </View>
      </View>
    );
  }

  if (locationPermission === "denied") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
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
            style={[styles.stateBody, { color: theme.colors.onSurfaceVariant }]}
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
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.mapContainer}>
        <Map style={styles.map} mapStyle={EMPTY_STYLE} androidView="texture">
          <Camera
            trackUserLocation={followUser ? "default" : undefined}
            zoom={14}
          />
          <RasterSource
            id="tileserver"
            tiles={[tileUrl]}
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
              onPress={() => {
                setFollowUser(false);
                clearPath();
                setSelectedUser({
                  user_id: loc.user_id,
                  username: loc.username,
                  timestamp: loc.timestamp,
                });
                if (pathMode) {
                  handleViewPath(loc.user_id);
                }
              }}
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
          {showPath && pathGeoJSON && (
            <GeoJSONSource id="user-path-source" data={pathGeoJSON} lineMetrics>
              <Layer
                id="user-path-line"
                type="line"
                paint={{
                  "line-gradient": [
                    "interpolate",
                    ["linear"],
                    ["line-progress"],
                    0,
                    `${theme.colors.error}1A`,
                    1,
                    theme.colors.error,
                  ],
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["line-progress"],
                    0,
                    1.5,
                    1,
                    4,
                  ],
                }}
                layout={{
                  "line-cap": "round",
                  "line-join": "round",
                }}
              />
            </GeoJSONSource>
          )}
          {showPath && pathEndpoints && (
            <>
              <GeoJSONSource
                id="path-start-source"
                data={{
                  type: "FeatureCollection",
                  features: [
                    {
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: pathEndpoints.oldest,
                      },
                      properties: {},
                    },
                  ],
                }}
              >
                <Layer
                  id="path-start-circle"
                  type="circle"
                  paint={{
                    "circle-radius": 5,
                    "circle-color": "transparent",
                    "circle-stroke-width": 2,
                    "circle-stroke-color": theme.colors.error,
                  }}
                />
              </GeoJSONSource>
              <GeoJSONSource
                id="path-end-source"
                data={{
                  type: "FeatureCollection",
                  features: [
                    {
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: pathEndpoints.newest,
                      },
                      properties: {},
                    },
                  ],
                }}
              >
                <Layer
                  id="path-end-circle"
                  type="circle"
                  paint={{
                    "circle-radius": 7,
                    "circle-color": theme.colors.error,
                    "circle-stroke-width": 2.5,
                    "circle-stroke-color": theme.colors.surface,
                  }}
                />
              </GeoJSONSource>
            </>
          )}
        </Map>
        {((showPath && pathGeoJSON) || showNoHistoryBanner) && (
          <View style={styles.pathBanner}>
            <View
              style={[
                styles.pathBannerCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Icon
                source={
                  showNoHistoryBanner ? "map-marker-off" : "map-marker-path"
                }
                size={16}
                color={
                  showNoHistoryBanner
                    ? theme.colors.onSurfaceVariant
                    : theme.colors.primary
                }
              />
              <Text
                variant="bodySmall"
                style={styles.pathBannerText}
                numberOfLines={1}
              >
                {showNoHistoryBanner
                  ? `No history for ${selectedUser?.username ?? "User"}`
                  : `${selectedUser?.username ?? "User"}'s path`}
              </Text>
              <Pressable onPress={clearPath} hitSlop={8}>
                <Icon
                  source="close-circle"
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                />
              </Pressable>
            </View>
          </View>
        )}
        <View style={styles.pathToggle}>
          <View
            style={[
              styles.pathToggleCard,
              {
                backgroundColor: pathMode
                  ? theme.colors.primaryContainer
                  : theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                if (pathMode) clearPath();
                setPathMode((prev) => !prev);
              }}
              hitSlop={8}
            >
              <Icon
                source="map-marker-path"
                size={22}
                color={
                  pathMode
                    ? theme.colors.onPrimaryContainer
                    : theme.colors.primary
                }
              />
            </Pressable>
          </View>
        </View>
        {!followUser && (
          <View style={styles.recenterButton}>
            <View
              style={[
                styles.recenterCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Pressable onPress={handleRecenter} hitSlop={8}>
                <Icon
                  source="crosshairs-gps"
                  size={22}
                  color={theme.colors.primary}
                />
              </Pressable>
            </View>
          </View>
        )}
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
              <LoadingSpinner />
              <Text variant="bodySmall">Fetching live locations...</Text>
            </View>
          </View>
        )}
        {isError && (
          <View
            pointerEvents="box-none"
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
              <Icon
                source="alert-circle-outline"
                size={20}
                color={theme.colors.error}
              />
              <Text variant="bodySmall" style={{ textAlign: "center" }}>
                {errorMessage}
              </Text>
              <Button mode="contained" onPress={() => refetch()} compact>
                Retry
              </Button>
            </View>
          </View>
        )}
        {showEmptyState && (
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
              <Icon
                source="account-group-outline"
                size={20}
                color={theme.colors.primary}
              />
              <Text variant="bodySmall" style={{ textAlign: "center" }}>
                No other users are sharing their location right now.
              </Text>
            </View>
          </View>
        )}
      </View>
      <UserMarkerSheet
        selectedUser={selectedUser}
        pathMode={pathMode}
        onDismiss={() => {
          setSelectedUser(null);
          clearPath();
        }}
        onMessage={handleMessage}
        onViewPath={handleViewPath}
        hasPath={showPath && pathGeoJSON !== null}
        isPathLoading={isPathFetching}
        onClearPath={clearPath}
      />
      <AppSnackbar visible={visible} onDismiss={hideToast} variant={variant}>
        {message}
      </AppSnackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
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
  pathBanner: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 56,
  },
  pathBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  pathBannerText: {
    flex: 1,
  },
  pathToggle: {
    position: "absolute",
    top: 60,
    right: 8,
  },
  pathToggleCard: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  recenterButton: {
    position: "absolute",
    top: 108,
    right: 8,
  },
  recenterCard: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
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
