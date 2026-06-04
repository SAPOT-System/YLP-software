import { AUTH_ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth";
import { uiLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, useTheme } from "react-native-paper";
uiLog.debug("[relogin-banner] module loaded");

const BANNER_HEIGHT = 36;

export function ReloginBanner() {
  const { needsReloginForServer, isGuest } = useAuth();
  const theme = useTheme();
  const { top: safeTop } = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current;

  const visible = needsReloginForServer && !isGuest;

  useEffect(() => {
    uiLog.debug("[ReloginBanner] visibility changed", { visible });
    Animated.spring(translateY, {
      toValue: visible ? 0 : -BANNER_HEIGHT,
      useNativeDriver: true,
      bounciness: 3,
      speed: 16,
    }).start();
  }, [visible, translateY]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: safeTop,
        left: 0,
        right: 0,
        height: BANNER_HEIGHT,
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => {
          uiLog.info("[ReloginBanner] tapped — navigating to server login");
          router.push(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
        }}
      >
        <Animated.View
          style={{
            height: BANNER_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.secondaryContainer,
            transform: [{ translateY }],
          }}
        >
          <Icon
            source="login"
            size={14}
            color={theme.colors.onSecondaryContainer}
          />
          <Text
            style={{
              color: theme.colors.onSecondaryContainer,
              fontSize: 12,
              marginLeft: 6,
            }}
          >
            Server session expired — tap to reconnect
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
