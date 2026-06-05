import { useAuth } from "@/features/auth";
import { useAppMode, useServerHealth } from "@/features/shared/context";
import { uiLog } from "@/features/shared/utils/logger";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, useTheme } from "react-native-paper";
import { AnimatedBannerStrip } from "./animated-banner-strip";
uiLog.debug("[server-status-banner] module loaded");

const BANNER_HEIGHT = 32;

type BannerState = "hidden" | "offline" | "reconnected";

function useBannerState(offline: boolean): BannerState {
  const [state, setState] = useState<BannerState>("hidden");
  const prevOffline = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (offline) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState("offline");
    } else if (prevOffline.current) {
      setState("reconnected");
      timerRef.current = setTimeout(() => setState("hidden"), 2000);
    }
    prevOffline.current = offline;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [offline]);

  return state;
}

function OfflineBanner({
  state,
  top,
  variant,
}: {
  state: BannerState;
  top: number;
  variant?: "auth" | "unauth";
}) {
  const theme = useTheme();
  const visible = state !== "hidden";
  const lastActiveState = useRef<"offline" | "reconnected">("offline");
  if (state !== "hidden") lastActiveState.current = state;

  const isReconnected = lastActiveState.current === "reconnected";
  const backgroundColor = isReconnected
    ? theme.colors.tertiaryContainer
    : theme.colors.errorContainer;
  const iconColor = isReconnected ? theme.colors.tertiary : theme.colors.error;
  const textColor = isReconnected
    ? theme.colors.onTertiaryContainer
    : theme.colors.onErrorContainer;

  return (
    <AnimatedBannerStrip
      visible={visible}
      top={top}
      height={BANNER_HEIGHT}
      zIndex={999}
      pointerEvents="none"
    >
      <View style={[styles.row, { backgroundColor }]}>
        <Icon
          source={isReconnected ? "cloud-check" : "cloud-alert"}
          size={14}
          color={iconColor}
        />
        <Text style={[styles.text, { color: textColor }]}>
          {isReconnected
            ? "Server online"
            : variant === "auth"
            ? "Server unavailable — do not logout, your data will be lost"
            : "Server unavailable"}
        </Text>
      </View>
    </AnimatedBannerStrip>
  );
}

/** Used inside the drawer layout (ServerHealthProvider).
 *  Hidden until the initial health check completes.
 *  Suppresses itself when OfflineExpiredBanner is active — that banner
 *  already communicates server-down with more specific messaging. */
export function ServerStatusBanner() {
  const { online, initialChecked } = useServerHealth();
  const { isOfflineWithExpiredToken } = useAuth();
  const { store } = useAppMode();
  const { top: safeTop } = useSafeAreaInsets();
  const [ready, setReady] = useState(false);

  const effectiveMode = store.getEffectiveMode(false);
  const isServerMode = effectiveMode === "server" || effectiveMode === "auto";
  const shouldWarn = initialChecked && isServerMode && !online;

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 10000);
    return () => clearTimeout(t);
  }, []);

  const state = useBannerState(ready && shouldWarn && !isOfflineWithExpiredToken);
  return <OfflineBanner state={state} top={safeTop} variant="auth" />;
}

/** Used inside auth / getting-started layouts (ServerHealthProvider / GET /). */
export function ServerHealthBanner() {
  const { online } = useServerHealth();
  const { top: safeTop } = useSafeAreaInsets();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 5500);
    return () => clearTimeout(t);
  }, []);

  const state = useBannerState(ready && online === false && online !== null);
  console.log("state", state);
  return <OfflineBanner state={state} top={safeTop} variant="unauth" />;
}

const styles = StyleSheet.create({
  row: {
    height: BANNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 12,
    marginLeft: 6,
  },
});
