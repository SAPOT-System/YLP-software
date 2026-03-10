import { Drawer } from "expo-router/drawer";
import { ContainerProvider } from "@/features/shared/context";
import { useAuth } from "@/features/auth";
import { Redirect } from "expo-router";
import { AUTH_ROUTES } from "../routes";
import { ActivityIndicator } from "react-native-paper";

export default function DrawerLayout() {
  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, loading } = auth;

  if (loading) {
    return <ActivityIndicator />;
  }

  if (!isAuthenticated) {
    return <Redirect href={AUTH_ROUTES.LOGIN.SERVER_LOGIN} />;
  }

  return (
    <ContainerProvider>
      <Drawer>
        <Drawer.Screen
          name="(tabs)"
          options={{
            drawerLabel: "Home",
            title: "SAPOT",
            // headerShown: false,
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
    </ContainerProvider>
  );
}
