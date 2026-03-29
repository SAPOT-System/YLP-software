import { useAuth } from "@/features/auth";
import { CustomDrawerContent } from "@/features/shared/components/custom-drawer-content";
import { MainContainerProvider } from "@/features/shared/context";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { ActivityIndicator, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { AUTH_ROUTES } from "../routes";

const queryClient = new QueryClient();

export default function DrawerLayout() {
  const auth = useAuth();
  const theme = useTheme();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, loading, isGuest } = auth;

  if (loading) {
    return <ActivityIndicator />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Redirect href={AUTH_ROUTES.GETTING_STARTED} />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <MainContainerProvider>
        <QueryClientProvider client={queryClient}>
          <Drawer
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
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
              options={({ route }) => {
                const focusedRoute =
                  getFocusedRouteNameFromRoute(route) ?? "index";

                return {
                  drawerLabel: "Home",
                  title: "SAPOT",
                  drawerItemStyle: { display: "none" },
                  headerShown: focusedRoute !== "settings",
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
        </QueryClientProvider>
      </MainContainerProvider>
    </SafeAreaView>
  );
}
