import { Redirect, Stack } from "expo-router";
import { HealthProvider } from "@/features/shared/context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth";
import { APP_ROUTES } from "../routes";
import { ActivityIndicator } from "react-native-paper";
import { navLog } from "@/features/shared";

export default function Layout() {
  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, isGuest } = auth;

  if (isAuthenticated || isGuest) {
    navLog.info("navigate", {
      screen: APP_ROUTES.HOME,
      isAuthenticated,
    });
    return <Redirect href={APP_ROUTES.HOME} />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
      <HealthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </HealthProvider>
    </SafeAreaView>
  );
}
