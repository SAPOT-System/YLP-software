import { ServerHealthProvider } from "@/features/shared/core/context";
import { ServerHealthBanner } from "@/features/shared/components/server-status-banner";
import { authLog } from "@/features/shared/core/utils/logger";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Layout() {
  useEffect(() => {
    authLog.info("[AuthLayout] mounted");
    return () => {
      authLog.info("[AuthLayout] unmounted");
    };
  }, []);

  return (
    <ServerHealthProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <ServerHealthBanner />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaView>
    </ServerHealthProvider>
  );
}
