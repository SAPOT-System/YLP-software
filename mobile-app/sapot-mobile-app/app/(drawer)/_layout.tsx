import { useAuth } from "@/features/auth";
import { MainContainerProvider } from "@/features/shared/context";
import { DrawerItem } from "@react-navigation/drawer";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { ActivityIndicator } from "react-native-paper";
import { AUTH_ROUTES } from "../routes";

export default function DrawerLayout() {
  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, loading, isGuest, logout } = auth;

  if (loading) {
    return <ActivityIndicator />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Redirect href={AUTH_ROUTES.LOGIN.SERVER_LOGIN} />;
  }

  return (
    <MainContainerProvider>
      <Drawer
        drawerContent={(props) => {
          const { state, navigation, descriptors } = props;
          return (
            <>
              {/* Render default screens */}
              {state.routes.map((route, _) => {
                const descriptor = descriptors[route.key];
                return (
                  <DrawerItem
                    key={route.key}
                    label={descriptor.options.drawerLabel || route.name}
                    onPress={() => navigation.navigate(route.name)}
                  />
                );
              })}
              {/* Logout button */}
              <DrawerItem label="Logout" onPress={logout} />
            </>
          );
        }}
      >
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
    </MainContainerProvider>
  );
}
