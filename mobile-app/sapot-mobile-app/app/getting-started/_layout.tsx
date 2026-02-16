import { Stack } from "expo-router";
import { HealthProvider } from "@/features/shared/context";

export default function Layout() {
  return (
    <HealthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="lan-login" options={{ headerShown: false }} />
        <Stack.Screen name="server-login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="email-reset" options={{ headerShown: false }} />
        <Stack.Screen name="sms-reset" options={{ headerShown: false }} />
        <Stack.Screen name="enter-recovery" options={{ headerShown: false }} />
      </Stack>
    </HealthProvider>
  );
}
