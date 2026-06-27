import { AUTH_ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth";
import { uiLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, useTheme } from "react-native-paper";
import { AnimatedBannerStrip } from "./animated-banner-strip";
uiLog.debug("[relogin-banner] module loaded");

const BANNER_HEIGHT = 36;

export function ReloginBanner() {
  const { needsReloginForServer, isGuest } = useAuth();
  const theme = useTheme();
  const { top: safeTop } = useSafeAreaInsets();

  return (
    <AnimatedBannerStrip
      visible={needsReloginForServer && !isGuest}
      top={safeTop}
      height={BANNER_HEIGHT}
      zIndex={1000}
    >
      <Pressable
        onPress={() => {
          uiLog.info("[ReloginBanner] tapped — navigating to server login");
          router.push(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
        }}
        style={[styles.row, { backgroundColor: theme.colors.secondaryContainer }]}
      >
        <Icon source="login" size={14} color={theme.colors.onSecondaryContainer} />
        <Text style={[styles.text, { color: theme.colors.onSecondaryContainer }]}>
          Server session expired — tap to reconnect
        </Text>
      </Pressable>
    </AnimatedBannerStrip>
  );
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
