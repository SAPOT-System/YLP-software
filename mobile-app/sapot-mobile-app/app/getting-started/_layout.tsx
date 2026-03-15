import { router, Stack } from "expo-router";
import { HealthProvider } from "@/features/shared/context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth";
import { APP_ROUTES } from "../routes";
import { useEffect } from "react";

export default function Layout() {
  const auth = useAuth();

  useEffect(() => {
    if (auth && auth.isAuthenticated && auth.isGuest) {
      router.replace(APP_ROUTES.HOME);
    }
  }, [auth]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
      <HealthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </HealthProvider>
    </SafeAreaView>
  );
}
