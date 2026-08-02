import motion from "@/constants/motion";
import { useReducedMotion } from "@/features/shared/hooks";
import { useEffect } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LottieProgressBar } from "./ProgressBar";

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  /**
   *controls the logo's transparency
   */
  const opacity = useSharedValue(0);
  /**
   *controls the logo's size
   */
  const scale = useSharedValue(0.8);
  const colorScheme = useColorScheme();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // shows the logo in fades in
    if (reducedMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, {
        duration: motion.duration.slow,
        easing: Easing.bezier(...motion.easing.standard),
      });
    }
    // TODO: make the logo smaller

    // hide splash screen after 6 seconds
    const timeout = setTimeout(onFinish, 6000);
    return () => clearTimeout(timeout);
  }, [onFinish, opacity, reducedMotion]);

  // binds the animated values to the logo's style
  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const backgroundColor = colorScheme === "dark" ? "#363636" : "#EAEDF3";

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Animated.Image
        source={require("../assets/images/logo.png")}
        style={[styles.logo, logoStyle]}
      />
      <LottieProgressBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 120,
    height: 120,
  },
});
