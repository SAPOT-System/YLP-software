import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

interface SkeletonGroupProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Accessible root for a screen-level skeleton. Do not nest these. */
export function SkeletonGroup({ label = "Loading", style, children }: SkeletonGroupProps) {
  return <View style={style} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>;
}
