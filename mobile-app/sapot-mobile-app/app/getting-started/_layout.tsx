import { Redirect, Stack } from "expo-router";
import { HealthProvider } from "@/features/shared/context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth";
import { APP_ROUTES } from "../routes";
import { ActivityIndicator } from "react-native-paper";

export default function Layout() {
  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, isGuest } = auth;

  if (isAuthenticated || isGuest) {
    console.log("getting started layout redirecting to home");
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
