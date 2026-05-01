import { useAuth } from "@/features/auth";
import { GpsPreferenceProvider } from "@/features/gps/context/gps-preference-context";
import { useGpsStreaming } from "@/features/gps/hooks/useGpsStreaming";
import "../../task/signaling-task";
import { CustomDrawerContent } from "@/features/shared/components/custom-drawer-content";
import { MainContainerProvider, useAppMode } from "@/features/shared/context";
import { navLog } from "@/features/shared/utils/logger";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useEffect, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Icon, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { AUTH_ROUTES } from "../routes";
import { CallProvider } from "@/features/call/context/call-context";
import { useBackgroundTask } from "@/features/shared/hooks/use-background-task";
import { useNotifications } from "@/features/shared/hooks/use-notifications";
import { useGlobalCallEndedListener } from "@/features/call/hooks/use-global-call-ended-listener";
import { ChatRoomSource } from "@/features/chat/types";
import { router } from "expo-router";
import { Platform } from "react-native";

const queryClient = new QueryClient();

function GpsStreamingEffect() {
  useGpsStreaming();
  return null;
}

function GlobalCallEndedEffect() {
  useGlobalCallEndedListener();
  return null;
}

export default function DrawerLayout() {
  const { isAuthenticated, loading, isGuest, isRescuer } = useAuth();
  const theme = useTheme();
  const { store } = useAppMode();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { unregister } = useBackgroundTask();

  // Dedup guard — prevents double navigation when both responseListener and
  // getLastNotificationResponseAsync fire for the same cold-start tap.
  const handledNotifIdRef = useRef<string | null>(null);
  const handledNotifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useNotifications(
    (incomingCallData) => {
      if (handledNotifIdRef.current === incomingCallData.notificationId) return;
      handledNotifIdRef.current = incomingCallData.notificationId;
      navLog.info("[DrawerLayout] incoming call via notification listener", {
        notificationId: incomingCallData.notificationId,
      });

      if (handledNotifTimeoutRef.current) {
        clearTimeout(handledNotifTimeoutRef.current);
      }

      handledNotifTimeoutRef.current = setTimeout(() => {
        handledNotifIdRef.current = null;
      }, 30_000);
      router.push({
        pathname: "/(drawer)/(tabs)/call/incoming",
        params: {
          id: incomingCallData.callerId,
          type: incomingCallData.callType,
          conversationId: incomingCallData.conversationId ?? "",
        },
      });
    },
    undefined,
    (incomingMsgData) => {
      if (handledNotifIdRef.current === incomingMsgData.notificationId) return;
      handledNotifIdRef.current = incomingMsgData.notificationId;
      navLog.info("[DrawerLayout] incoming message tapped via notification", {
        notificationId: incomingMsgData.notificationId,
        conversationId: incomingMsgData.conversationId,
      });

      if (handledNotifTimeoutRef.current) {
        clearTimeout(handledNotifTimeoutRef.current);
      }

      handledNotifTimeoutRef.current = setTimeout(() => {
        handledNotifIdRef.current = null;
      }, 30_000);
      router.push({
        pathname: "/(drawer)/(tabs)/chat/[id]",
        params: {
          id: incomingMsgData.conversationId,
          source: ChatRoomSource.CHAT,
        },
      });
    }
  );

  handledNotifTimeoutRef.current = setTimeout(() => {
    handledNotifIdRef.current = null;
  }, 30_000);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    // Handle cold-start tap — app was completely killed and user tapped notification.
    // useNotifications responseListener won't fire in this case because
    // the listener wasn't mounted yet when the tap happened.
    // getLastNotificationResponseAsync catches it instead.
    // The handledNotifIdRef guard prevents double-navigation if both paths fire.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;

      const notifId = response.notification.request.identifier;
      const data = response.notification.request.content.data;

      if (data?.type === "incoming_call") {
        if (handledNotifIdRef.current === notifId) return;
        handledNotifIdRef.current = notifId;

        navLog.info("[DrawerLayout] incoming call via cold-start response", {
          notifId,
        });
        // Delay until router is fully mounted
        setTimeout(() => {
          router.push({
            pathname: "/(drawer)/(tabs)/call/incoming",
            params: {
              id: String(data.id ?? ""),
              type: String(data["call_type"] ?? ""),
              conversationId: String(data["conversation_id"] ?? ""),
            },
          });
        }, 300);
      } else if (data?.type === "incoming_message") {
        if (handledNotifIdRef.current === notifId) return;
        handledNotifIdRef.current = notifId;

        navLog.info("[DrawerLayout] incoming message via cold-start response", {
          notifId,
        });
        // Delay until router is fully mounted
        setTimeout(() => {
          router.push({
            pathname: "/(drawer)/(tabs)/chat/[id]",
            params: {
              id: String(data["conversation_id"] ?? ""),
              source: ChatRoomSource.CHAT,
            },
          });
        }, 300);
      }
    });
  }, []);

  useEffect(() => {
    navLog.info("[DrawerLayout] mounted");
    return () => {
      navLog.info("[DrawerLayout] unmounted");
    };
  }, []);

  const effectiveMode = store.getEffectiveMode(isGuest);
  const modeLabel =
    effectiveMode === "auto"
      ? "Auto"
      : effectiveMode === "server"
      ? "Server"
      : "LAN";

  const labelIcon = {
    Auto: "circle",
    Server: "weather-cloudy",
    LAN: "network-strength-4",
  };

  useEffect(() => {
    navLog.debug("[DrawerLayout] useEffect triggered, deps:", {
      isAuthenticated,
      isGuest,
      loading,
    });
  }, [isAuthenticated, isGuest, loading]);

  if (loading) {
    navLog.info("[DrawerLayout] auth loading");
    return <ActivityIndicator />;
  }

  if (!isAuthenticated && !isGuest) {
    navLog.info("[Navigation] Navigating to GettingStarted", {
      screen: AUTH_ROUTES.GETTING_STARTED,
    });
    return <Redirect href={AUTH_ROUTES.GETTING_STARTED} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <GpsPreferenceProvider>
        <GpsStreamingEffect />
        <MainContainerProvider>
          <GlobalCallEndedEffect />
        <QueryClientProvider client={queryClient}>
          <CallProvider>
            <Drawer
              drawerContent={(props) => <CustomDrawerContent {...props} />}
              screenOptions={{
                headerStyle: {
                  backgroundColor: theme.colors.secondary,
                },
                headerTintColor: theme.dark ? "#FFF" : "#000",
                headerShadowVisible: false,
                drawerStyle: {
                  backgroundColor: theme.colors.secondary,
                },
                drawerItemStyle: {
                  marginHorizontal: 0,
                },
                drawerContentContainerStyle: {
                  paddingHorizontal: 0,
                },
              }}
            >
              <Drawer.Screen
                name="(tabs)"
                options={({ route, navigation }) => {
                  const focusedRoute =
                    getFocusedRouteNameFromRoute(route) ?? "index";
                  const routesWithoutHeader = [
                    "settings",
                    "public-chat",
                    "calls",
                    "server",
                    "chat/[id]",
                    "call/[id]",
                    "call/incoming",
                    "peer/[id]",
                    "scan-qr",
                  ];

                  return {
                    drawerLabel: "Home",
                    title: "SAPOT",
                    headerTitleAlign: "center",
                    headerTitleContainerStyle: {
                      justifyContent: "center",
                    },
                    headerTitleStyle: {
                      fontSize: 24,
                      fontWeight: "bold",
                      includeFontPadding: false,
                      textAlignVertical: "center",
                    },
                    drawerItemStyle: { display: "none" },
                    headerShown: !routesWithoutHeader.includes(focusedRoute),
                    headerTransparent: focusedRoute === "index",
                    headerStyle:
                      focusedRoute === "index"
                        ? { backgroundColor: "transparent" }
                        : undefined,
                    headerShadowVisible: focusedRoute !== "index",
                    headerLeft: () => (
                      <TouchableOpacity
                        onPress={() => {
                          navLog.debug("[DrawerLayout] onPress triggered");
                          navigation.toggleDrawer();
                        }}
                        style={{
                          width: 35,
                          height: 23,
                          marginLeft: 16,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 35,
                            height: 23,
                            justifyContent: "space-between",
                          }}
                        >
                          <View
                            style={{
                              height: 5,
                              borderRadius: 2.5,
                              backgroundColor: theme.dark ? "#FFF" : "#000",
                            }}
                          />
                          <View
                            style={{
                              height: 5,
                              borderRadius: 2.5,
                              backgroundColor: theme.dark ? "#FFF" : "#000",
                            }}
                          />
                          <View
                            style={{
                              height: 5,
                              borderRadius: 2.5,
                              backgroundColor: theme.dark ? "#FFF" : "#000",
                            }}
                          />
                        </View>
                      </TouchableOpacity>
                    ),
                    headerRight: () => (
                      <View
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          width: 60,
                          height: 23,
                          marginRight: 16,
                          paddingVertical: 1,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: "#103462",
                        }}
                      >
                        <Icon
                          source={labelIcon[modeLabel]}
                          size={12}
                          color="#103462"
                        />
                        <Text
                          style={{
                            marginLeft: 2,
                            fontSize: 11,
                            lineHeight: 13,
                            fontWeight: "600",
                            color: "#103462",
                          }}
                        >
                          {modeLabel}
                        </Text>
                      </View>
                    ),
                  };
                }}
              />
              <Drawer.Screen
                name="search"
                options={{
                  drawerLabel: "search",
                  drawerItemStyle: { display: "none" },
                  title: "Search",
                  headerShown: false,
                }}
              />
              <Drawer.Screen
                name="gps"
                options={{
                  drawerLabel: "map",
                  title: "GPS Map",
                  headerShown: false,
                  drawerItemStyle: isRescuer ? undefined : { display: "none" },
                }}
              />
              <Drawer.Screen
                name="settings"
                options={{
                  drawerItemStyle: { display: "none" },
                  title: "Settings",
                  headerShown: false,
                }}
              />
            </Drawer>
          </CallProvider>
        </QueryClientProvider>
      </MainContainerProvider>
      </GpsPreferenceProvider>
    </SafeAreaView>
  );
}
