import { useAuth } from "@/features/auth";
import { uiLog } from "@/features/shared/core/utils/logger";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, useTheme } from "react-native-paper";
import { AnimatedBannerStrip } from "./animated-banner-strip";
uiLog.debug("[offline-expired-banner] module loaded");

const BANNER_HEIGHT = 36;

export function OfflineExpiredBanner() {
  const { isOfflineWithExpiredToken, isGuest } = useAuth();
  const theme = useTheme();
  const { top: safeTop } = useSafeAreaInsets();

  return (
    <AnimatedBannerStrip
      visible={isOfflineWithExpiredToken && !isGuest}
      top={safeTop}
      height={BANNER_HEIGHT}
      zIndex={999}
      pointerEvents="none"
    >
      <View style={[styles.row, { backgroundColor: theme.colors.errorContainer }]}>
        <Icon source="alert" size={14} color={theme.colors.error} />
        <Text style={[styles.text, { color: theme.colors.onErrorContainer }]}>
          Server unreachable — do not logout, your data will be lost
        </Text>
      </View>
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
