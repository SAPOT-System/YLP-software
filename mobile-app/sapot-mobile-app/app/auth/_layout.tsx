import { HealthProvider } from "@/features/shared/context";
import { authLog } from "@/features/shared/utils/logger";
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
    <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
      <HealthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </HealthProvider>
    </SafeAreaView>
  );
}
