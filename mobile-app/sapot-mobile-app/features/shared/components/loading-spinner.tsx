import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, useTheme } from "react-native-paper";

interface LoadingSpinnerProps {
  size?: "small" | "large";
  style?: StyleProp<ViewStyle>;
}

export const LoadingSpinner = ({ size = "small", style }: LoadingSpinnerProps) => {
  const theme = useTheme();
  return <ActivityIndicator size={size} color={theme.colors.primary} style={style} />;
};
