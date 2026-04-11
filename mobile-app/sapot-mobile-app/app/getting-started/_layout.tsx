import { useAuth } from "@/features/auth";
import { navLog } from "@/features/shared";
import { HealthProvider } from "@/features/shared/context";
import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_ROUTES } from "../routes";

export default function Layout() {
  const { isAuthenticated, isGuest } = useAuth();

  useEffect(() => {
    navLog.info("[GettingStartedLayout] mounted");
    return () => {
      navLog.info("[GettingStartedLayout] unmounted");
    };
  }, []);

  useEffect(() => {
    navLog.debug("[GettingStartedLayout] useEffect triggered, deps:", {
      isAuthenticated,
      isGuest,
    });
  }, [isAuthenticated, isGuest]);

  if (isAuthenticated || isGuest) {
    navLog.info("[Navigation] Navigating to Home", {
      screen: APP_ROUTES.HOME,
      isAuthenticated,
      isGuest,
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
