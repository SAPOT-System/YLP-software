import motion from "@/constants/motion";
import { useReducedMotion } from "@/features/shared/hooks";
import { useEffect } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A shimmering placeholder box used to build skeleton loading layouts.
 * Pulses opacity in a loop; freezes at a fixed dim opacity under reduced motion.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 6,
  style,
  testID,
}: SkeletonProps) {
  const theme = useTheme();
  const opacity = useSharedValue(0.4);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.4;
      return;
    }

    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, {
          duration: motion.duration.slow,
          easing: Easing.bezier(...motion.easing.standard),
        }),
        withTiming(0.4, {
          duration: motion.duration.slow,
          easing: Easing.bezier(...motion.easing.standard),
        })
      ),
      -1
    );
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.onSurfaceVariant,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export const skeletonStyles = StyleSheet.create({
  row: {
    gap: 6,
  },
});
