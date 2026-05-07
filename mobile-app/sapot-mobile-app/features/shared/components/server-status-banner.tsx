import { useServerHealth, useServerStatus } from "@/features/shared/context";
import { uiLog } from "@/features/shared/utils/logger";
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, useTheme } from "react-native-paper";
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

function OfflineBanner({ state }: { state: BannerState }) {
  const theme = useTheme();
  const { top: safeTop } = useSafeAreaInsets();
  const visible = state !== "hidden";
  const lastActiveState = useRef<"offline" | "reconnected">("offline");
  if (state !== "hidden") {
    lastActiveState.current = state;
  }
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current;

  useEffect(() => {
    uiLog.debug("[OfflineBanner] state changed", { state });
    Animated.spring(translateY, {
      toValue: visible ? 0 : -BANNER_HEIGHT,
      useNativeDriver: true,
      bounciness: 3,
      speed: 16,
    }).start();
  }, [visible, translateY]);

  const isReconnected = lastActiveState.current === "reconnected";
  const backgroundColor = isReconnected
    ? theme.colors.tertiaryContainer
    : theme.colors.errorContainer;
  const iconColor = isReconnected ? theme.colors.tertiary : theme.colors.error;
  const textColor = isReconnected
    ? theme.colors.onTertiaryContainer
    : theme.colors.onErrorContainer;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: safeTop,
        left: 0,
        right: 0,
        height: BANNER_HEIGHT,
        zIndex: 999,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[styles.banner, { transform: [{ translateY }], backgroundColor }]}
        pointerEvents="none"
      >
        <Icon
          source={isReconnected ? "cloud-check" : "cloud-alert"}
          size={14}
          color={iconColor}
        />
        <Text style={{ color: textColor, fontSize: 12, marginLeft: 6 }}>
          {isReconnected ? "Server online" : "Server unavailable"}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/** Used inside the drawer layout (HealthProvider / usePing). */
export function ServerStatusBanner() {
  const { shouldWarn } = useServerStatus();
  const state = useBannerState(shouldWarn);
  return <OfflineBanner state={state} />;
}

/** Used inside auth / getting-started layouts (ServerHealthProvider / GET /). */
export function ServerHealthBanner() {
  const { online } = useServerHealth();
  const state = useBannerState(!online);
  return <OfflineBanner state={state} />;
}

const styles = StyleSheet.create({
  banner: {
    height: BANNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
