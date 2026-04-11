import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import "react-native-reanimated";

if (__DEV__) {
  import("../features/shared/utils/reactotron");
}

import Colors from "@/constants/Colors";

import { AnimatedSplash } from "@/components/AnimatedSplash";

import {
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
  adaptNavigationTheme,
} from "react-native-paper";

import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import { AuthContainerProvider, AuthProvider } from "@/features/auth";
import {
  AppModeProvider,
  ThemePreferenceProvider,
  useThemePreference,
} from "@/features/shared/context";
import merge from "deepmerge";
import { SafeAreaProvider } from "react-native-safe-area-context";
// import { usePing } from "@/features/shared/hooks";

const customDarkTheme = { ...MD3DarkTheme, colors: Colors.dark };
const customLightTheme = { ...MD3LightTheme, colors: Colors.light };

const { LightTheme, DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const CombinedDefaultTheme = merge(LightTheme, customLightTheme);
const CombinedDarkTheme = merge(DarkTheme, customDarkTheme);

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  // initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  const [showSplash, setShowSplash] = useState(true);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      setTimeout(() => {
        setShowSplash(false);
      }, 1500);
    }
  }, [loaded]);

  if (!loaded || showSplash) {
    return (
      <AnimatedSplash
        onFinish={async () => {
          await SplashScreen.hideAsync();
          setShowSplash(false);
        }}
      />
    );
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <ThemePreferenceProvider>
      <RootLayoutWithTheme />
    </ThemePreferenceProvider>
  );
}

function RootLayoutWithTheme() {
  // const { latency } = usePing();
  const { resolvedTheme } = useThemePreference();

  const paperTheme =
    resolvedTheme === "dark" ? CombinedDarkTheme : CombinedDefaultTheme;

  return (
    <SafeAreaProvider>
      <AuthContainerProvider>
        <AuthProvider>
          <AppModeProvider>
            <PaperProvider theme={paperTheme}>
              <ThemeProvider value={paperTheme}>
                <Stack screenOptions={{ headerShown: false }} />
              </ThemeProvider>
            </PaperProvider>
          </AppModeProvider>
        </AuthProvider>
      </AuthContainerProvider>
    </SafeAreaProvider>
  );
}
