import motion from "@/constants/motion";
import { useReducedMotion } from "@/features/shared/hooks";
import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";

interface AnimatedBannerStripProps {
  visible: boolean;
  top: number;
  height: number;
  zIndex: number;
  pointerEvents?: "none" | "auto" | "box-none" | "box-only";
  children: React.ReactNode;
}

export function AnimatedBannerStrip({
  visible,
  top,
  height,
  zIndex,
  pointerEvents,
  children,
}: AnimatedBannerStripProps) {
  const translateY = useRef(new Animated.Value(-height)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const targetY = visible ? 0 : -height;

    if (reducedMotion) {
      translateY.setValue(targetY);
      return;
    }

    Animated.spring(translateY, {
      toValue: targetY,
      useNativeDriver: true,
      damping: motion.spring.gentle.damping,
      stiffness: motion.spring.gentle.stiffness,
    }).start();
  }, [visible, translateY, height, reducedMotion]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height,
        zIndex,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{ height, transform: [{ translateY }] }}
        pointerEvents={pointerEvents}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
