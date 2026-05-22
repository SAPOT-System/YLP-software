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
import { layoutLog } from "@/features/shared/utils/logger";

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
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

const manifest = Updates.manifest;
const metadata = 'metadata' in manifest ? manifest.metadata : undefined;
const extra = 'extra' in manifest ? manifest.extra : undefined;
const updateGroup = metadata && 'updateGroup' in metadata ? metadata.updateGroup : undefined;

Sentry.init({
  dsn: 'https://80658c8909d218d4a4edfb4e70de90cd@o4511433357590528.ingest.de.sentry.io/4511433383411792',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const scope = Sentry.getGlobalScope();

scope.setTag('expo-update-id', Updates.updateId);
scope.setTag('expo-is-embedded-update', Updates.isEmbeddedLaunch);

if (typeof updateGroup === 'string') {
  scope.setTag('expo-update-group-id', updateGroup);

  const owner = extra?.expoClient?.owner ?? '[account]';
  const slug = extra?.expoClient?.slug ?? '[project]';
  scope.setTag(
    'expo-update-debug-url',
    `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${updateGroup}`
  );
} else if (Updates.isEmbeddedLaunch) {
  // This will be `true` if the update is the one embedded in the build, and not one downloaded from the updates server.
  scope.setTag('expo-update-debug-url', 'not applicable for embedded updates');
}

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
  ErrorBoundary
} from "expo-router";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  // initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  const [showSplash, setShowSplash] = useState(true);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    layoutLog.debug("[RootLayout] useEffect triggered, deps:", { error });
    if (error) {
      layoutLog.error("[RootLayout] Error in font loading", { error });
      throw error;
    }
  }, [error]);

  useEffect(() => {
    layoutLog.debug("[RootLayout] useEffect triggered, deps:", { loaded });
    if (loaded) {
      layoutLog.info("[RootLayout] fonts loaded");
      SplashScreen.hideAsync();
      setTimeout(() => {
        setShowSplash(false);
      }, 1500);
    }
  }, [loaded]);

  useEffect(() => {
    layoutLog.info("[RootLayout] mounted");
    return () => {
      layoutLog.info("[RootLayout] unmounted");
    };
  }, []);

  if (!loaded || showSplash) {
    return (
      <AnimatedSplash
        onFinish={async () => {
          layoutLog.info("[RootLayout] splash finished");
          await SplashScreen.hideAsync();
          setShowSplash(false);
        }}
      />
    );
  }

  return <RootLayoutNav />;
});

function RootLayoutNav() {
  useEffect(() => {
    layoutLog.info("[RootLayoutNav] mounted");
    return () => {
      layoutLog.info("[RootLayoutNav] unmounted");
    };
  }, []);

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

  useEffect(() => {
    layoutLog.debug("[RootLayoutWithTheme] useEffect triggered, deps:", {
      resolvedTheme,
    });
  }, [resolvedTheme]);

  useEffect(() => {
    layoutLog.info("[RootLayoutWithTheme] mounted");
    return () => {
      layoutLog.info("[RootLayoutWithTheme] unmounted");
    };
  }, []);

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
