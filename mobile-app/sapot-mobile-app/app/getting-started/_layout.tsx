import { Stack } from "expo-router";
import { HealthProvider } from "@/features/shared/context";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Layout() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
      <HealthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="lan-login" options={{ headerShown: false }} />
          <Stack.Screen name="server-login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen
            name="forgot-password"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="email-reset" options={{ headerShown: false }} />
          <Stack.Screen name="sms-reset" options={{ headerShown: false }} />
          <Stack.Screen
            name="enter-recovery"
            options={{ headerShown: false }}
          />
        </Stack>
      </HealthProvider>
    </SafeAreaView>
  );
}
