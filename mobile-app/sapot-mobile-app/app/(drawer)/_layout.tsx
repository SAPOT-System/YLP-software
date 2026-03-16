import { useAuth } from "@/features/auth";
import { CustomDrawerContent } from "@/features/shared/components/custom-drawer-content";
import { MainContainerProvider } from "@/features/shared/context";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { ActivityIndicator, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { AUTH_ROUTES } from "../routes";

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
    return <Redirect href={AUTH_ROUTES.LOGIN.SERVER_LOGIN} />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <MainContainerProvider>
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
            options={{
              drawerLabel: "Home",
              title: "SAPOT",
              drawerItemStyle: { display: "none" },
            }}
          />
          <Drawer.Screen
            name="theme"
            options={{
              drawerLabel: "Theme",
              title: "Theme",
            }}
          />
        </Drawer>
      </MainContainerProvider>
    </SafeAreaView>
  );
}
