import { AUTH_ROUTES } from "@/config/routes";
import motion from "@/constants/motion";
import { PrimaryButton } from "@/features/auth";
import { useReducedMotion } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const REDIRECT_DELAY = 3000;

const SuccessScreen = () => {
  const theme = useTheme();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    authLog.info("[SuccessScreen] mounted");
    if (reducedMotion) {
      scale.value = 1;
      opacity.value = 1;
    } else {
      scale.value = withSpring(1, motion.spring.gentle);
      opacity.value = withTiming(1, {
        duration: motion.duration.slow,
        easing: Easing.bezier(...motion.easing.emphasized),
      });
    }

    timerRef.current = setTimeout(() => {
      authLog.info("[Navigation] Auto-redirect to ServerLogin from SuccessScreen");
      router.replace(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
    }, REDIRECT_DELAY);

    return () => {
      authLog.info("[SuccessScreen] unmounted");
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scale, opacity, reducedMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
      }}
    >
      <Animated.View style={iconStyle}>
        <Icon
          source="checkbox-marked-circle"
          size={120}
          color={theme.colors.primary}
        />
      </Animated.View>
      <View
        style={{ marginTop: 32, gap: 24, alignItems: "center", width: "100%" }}
      >
        <Text
          variant="headlineLarge"
          style={{ fontWeight: "bold", color: theme.colors.onSurface }}
        >
          Success!
        </Text>
        <Text variant="bodyMedium" style={{ textAlign: "center", color: theme.colors.onSurfaceVariant }}>
          Your password has been successfully changed. Make sure to remember the
          new password.
        </Text>
        <PrimaryButton
          style={{ width: "100%" }}
          onPress={() => {
            authLog.info("[Navigation] Navigating to ServerLogin", {
              screen: AUTH_ROUTES.LOGIN.SERVER_LOGIN,
            });
            if (timerRef.current) clearTimeout(timerRef.current);
            router.replace(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
          }}
        >
          Login
        </PrimaryButton>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Redirecting in 3s…
        </Text>
      </View>
    </View>
  );
};

export default SuccessScreen;
