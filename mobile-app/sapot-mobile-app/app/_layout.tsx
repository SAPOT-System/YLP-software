import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
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

import { AuthContainerProvider, AuthProvider, useAuth } from "@/features/auth";
import {
  AppModeProvider,
  ThemePreferenceProvider,
  useThemePreference,
} from "@/features/shared/context";
import merge from "deepmerge";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";

// Captured at module load for use in deferred Sentry init
const manifest = Updates.manifest;
const metadata = "metadata" in manifest ? manifest.metadata : undefined;
const extra = "extra" in manifest ? manifest.extra : undefined;
const updateGroup =
  metadata && "updateGroup" in metadata ? metadata.updateGroup : undefined;

const customDarkTheme = { ...MD3DarkTheme, colors: Colors.dark };
const customLightTheme = { ...MD3LightTheme, colors: Colors.light };

const { LightTheme, DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const CombinedDefaultTheme = merge(LightTheme, customLightTheme);
const CombinedDarkTheme = merge(DarkTheme, customDarkTheme);

export {
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  // initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  const [showSplash, setShowSplash] = useState(true);

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
      const timer = setTimeout(() => setShowSplash(false), 800);
      return () => clearTimeout(timer);
    }
  }, [loaded]);

  useEffect(() => {
    layoutLog.info("[RootLayout] mounted");
    return () => {
      layoutLog.info("[RootLayout] unmounted");
    };
  }, []);

  return (
    <ThemePreferenceProvider>
      <AuthContainerProvider>
        <AuthProvider>
          <RootLayoutGate
            loaded={loaded}
            showSplash={showSplash}
            setShowSplash={setShowSplash}
          />
        </AuthProvider>
      </AuthContainerProvider>
    </ThemePreferenceProvider>
  );
});

interface RootLayoutGateProps {
  loaded: boolean;
  showSplash: boolean;
  setShowSplash: (value: boolean) => void;
}

function RootLayoutGate({ loaded, showSplash, setShowSplash }: RootLayoutGateProps) {
  const { isBootstrapping: authLoading } = useAuth();
  const sentryInitialized = useRef(false);

  useEffect(() => {
    layoutLog.info("[RootLayoutGate] mounted");
    return () => {
      layoutLog.info("[RootLayoutGate] unmounted");
    };
  }, []);

  useEffect(() => {
    if (loaded && !showSplash && !authLoading && !sentryInitialized.current) {
      sentryInitialized.current = true;
      try {
        Sentry.init({
          dsn: "https://80658c8909d218d4a4edfb4e70de90cd@o4511433357590528.ingest.de.sentry.io/4511433383411792",
          sendDefaultPii: true,
          enableLogs: true,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1,
          integrations: [
            Sentry.mobileReplayIntegration(),
            Sentry.feedbackIntegration(),
          ],
        });

        const scope = Sentry.getGlobalScope();
        scope.setTag("expo-update-id", Updates.updateId);
        scope.setTag("expo-is-embedded-update", Updates.isEmbeddedLaunch);

        if (typeof updateGroup === "string") {
          scope.setTag("expo-update-group-id", updateGroup);
          const owner = extra?.expoClient?.owner ?? "[account]";
          const slug = extra?.expoClient?.slug ?? "[project]";
          scope.setTag(
            "expo-update-debug-url",
            `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${updateGroup}`
          );
        } else if (Updates.isEmbeddedLaunch) {
          scope.setTag(
            "expo-update-debug-url",
            "not applicable for embedded updates"
          );
        }
      } catch (err) {
        layoutLog.warn("[Sentry] deferred init failed", { err });
      }
    }
  }, [loaded, showSplash, authLoading]);

  if (!loaded || showSplash || authLoading) {
    return (
      <AnimatedSplash
        onFinish={async () => {
          layoutLog.info("[RootLayoutGate] splash finished");
          await SplashScreen.hideAsync();
          setShowSplash(false);
        }}
      />
    );
  }

  return <RootLayoutWithTheme />;
}

function RootLayoutWithTheme() {
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
      <AppModeProvider>
        <PaperProvider theme={paperTheme}>
          <ThemeProvider value={paperTheme}>
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </PaperProvider>
      </AppModeProvider>
    </SafeAreaProvider>
  );
}
