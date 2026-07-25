import motion from "@/constants/motion";
import { useReducedMotion } from "@/features/shared/hooks";
import { ReactNode, useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface CrossfadeProps {
  /** Changing this value triggers a fade-out/fade-in transition on the children. */
  activeKey: string | number | boolean;
  children: ReactNode;
}

/**
 * Wraps content that swaps in place (an icon, a status label) and fades
 * it out/in on `activeKey` change instead of snapping instantly.
 */
export function Crossfade({ activeKey, children }: CrossfadeProps) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, {
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easing.standard),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
