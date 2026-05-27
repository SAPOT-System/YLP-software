import { AUTH_ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth";
import { AnnouncementSeenProvider } from "@/features/announcements/context/announcement-seen-context";
import { CallBanner } from "@/features/call/components/call-banner";
import { CallProvider } from "@/features/call/context/call-context";
import { useGlobalCallEndedListener } from "@/features/call/hooks/use-global-call-ended-listener";
import { ChatRoomSource } from "@/features/chat/types";
import { GpsPreferenceProvider } from "@/features/gps/context/gps-preference-context";
import { useGpsStreaming } from "@/features/gps/hooks/useGpsStreaming";
import { CustomDrawerContent } from "@/features/shared/components/custom-drawer-content";
import { ServerStatusBanner } from "@/features/shared/components/server-status-banner";
import { ZeroconfStatusIndicator } from "@/features/shared/components/zeroconf-status-indicator";
import { HealthProvider, MainContainerProvider, useAppMode } from "@/features/shared/context";
import { useBackgroundTask } from "@/features/shared/hooks/use-background-task";
import { useForegroundSync } from "@/features/shared/hooks/use-foreground-sync";
import { useNotifications } from "@/features/shared/hooks/use-notifications";
import { useZeroconfPublished } from "@/features/shared/hooks/use-zeroconf-published";
import { navLog } from "@/features/shared/utils/logger";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Redirect, router } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useEffect, useRef } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Icon, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import "../../task/signaling-task";

const queryClient = new QueryClient();
function GpsStreamingEffect() {
  useGpsStreaming();
  return null;
}
function GlobalCallEndedEffect() {
  useGlobalCallEndedListener();
  return null;
}
function ForegroundSyncEffect() {
  useForegroundSync();
  return null;
}
const labelIcon = {
  auto: "swap-horizontal",
  server: "server",
  lan: "lan",
} as const;

function HeaderRight() {
  const { isPublished, isZeroconfAllowed } = useZeroconfPublished();
  const { store } = useAppMode();

  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginRight: 16,
      }}
    >
      <ZeroconfStatusIndicator
        isPublished={isPublished}
        isZeroconfAllowed={isZeroconfAllowed}
      />
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          width: 60,
          height: 23,
          paddingVertical: 1,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "#103462",
        }}
      >
        <Icon source={labelIcon[store.mode]} size={12} color="#103462" />
        <Text
          style={{
            marginLeft: 2,
            fontSize: 11,
            lineHeight: 13,
            fontWeight: "600",
            color: "#103462",
          }}
        >
          {store.mode.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  const { isAuthenticated, loading, isGuest } = useAuth();
  const theme = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { unregister } = useBackgroundTask();
  const handledNotifIdRef = useRef<string | null>(null);
  const handledNotifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  Notifications.getLastNotificationResponseAsync().then((response) => {
  if (!response) return;

  const notifId = response.notification.request.identifier;
  const data = response.notification.request.content.data;

  if (data?.type === "incoming_call") {
  if (handledNotifIdRef.current === notifId) return;
  handledNotifIdRef.current = notifId;
  navLog.info("[DrawerLayout] cold-start incoming call", {
          notificationId: notifId,
        });

        router.push({
          pathname: "/(drawer)/(tabs)/call/incoming",
          params: {
            id: String(data.callerId ?? ""),
            type: String(data.callType ?? "audio"),
            conversationId: String(data.conversationId ?? ""),
          },
        });
      }

      if (data?.type === "message") {
  if (handledNotifIdRef.current === notifId) return;
  handledNotifIdRef.current = notifId;
  navLog.info("[DrawerLayout] cold-start message tap", {
          notificationId: notifId,
        });

        router.push({
          pathname: "/(drawer)/(tabs)/chat/[id]",
          params: {
            id: String(data.conversationId ?? ""),
            source: ChatRoomSource.CHAT,
          },
        });
      }
    });
  }, []);

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
      <HealthProvider>
        <ServerStatusBanner />
        <GpsPreferenceProvider>
        <GpsStreamingEffect />
        <MainContainerProvider>
          <GlobalCallEndedEffect />
          <ForegroundSyncEffect />
          <QueryClientProvider client={queryClient}>
            <AnnouncementSeenProvider>
            <CallProvider>
              <CallBanner />
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
                    const focusedRoute = getFocusedRouteNameFromRoute(route) ?? "index";
                    const routesWithoutHeader = [
                      "settings",
                      "public-chat",
                      "map",
                      "server",
                      "chat/[id]",
                      "call/[id]",
                      "call/incoming",
                      "peer/[id]",
                      "scan-qr",
                    ];

                    return {
                      drawerLabel: "Home",
                      title: "",
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
                      headerRight: () => <HeaderRight />,
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
                  name="announcements"
                  options={{
                    drawerLabel: "announcements",
                    drawerItemStyle: { display: "none" },
                    title: "Announcements",
                    headerShown: false,
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
            </AnnouncementSeenProvider>
          </QueryClientProvider>
        </MainContainerProvider>
      </GpsPreferenceProvider>
      </HealthProvider>
    </SafeAreaView>
  );
}
