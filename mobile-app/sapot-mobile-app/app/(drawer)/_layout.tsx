import { useAuth } from "@/features/auth";
import { CustomDrawerContent } from "@/features/shared/components/custom-drawer-content";
import { MainContainerProvider, useAppMode } from "@/features/shared/context";
import { navLog } from "@/features/shared/utils/logger";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useEffect } from "react";
import { TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Icon, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { AUTH_ROUTES } from "../routes";
import { CallProvider } from "@/features/call/context/call-context";

const queryClient = new QueryClient();

export default function DrawerLayout() {
  const { isAuthenticated, loading, isGuest } = useAuth();
  const theme = useTheme();
  const { store } = useAppMode();

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
    <SafeAreaView style={{ flex: 1 }}>
      <MainContainerProvider>
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
    </SafeAreaView>
  );
}
