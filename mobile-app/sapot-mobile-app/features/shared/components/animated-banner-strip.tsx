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

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -height,
      useNativeDriver: true,
      bounciness: 3,
      speed: 16,
    }).start();
  }, [visible, translateY, height]);

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
