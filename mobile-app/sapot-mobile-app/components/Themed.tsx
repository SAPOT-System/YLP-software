import React from "react";
import { Text as DefaultText, View as DefaultView } from "react-native";
import { useTheme, useThemeColor } from "./useTheme";
import Colors from "@/constants/Colors";

/**
 * Common props that enable theme customization for components.
 * Allows overriding colors for specific light/dark theme modes.
 */
type ThemeProps = {
  /** Custom color to use in light theme mode */
  lightColor?: string;
  /** Custom color to use in dark theme mode */
  darkColor?: string;
};

/**
 * Props for the themed Text component.
 * Extends React Native's Text props with theming capabilities.
 */
export type TextProps = ThemeProps &
  DefaultText["props"] & {
    /** Visual variant that determines the text color */
    variant?: "default" | "secondary" | "muted" | "accent";
  };

/**
 * Props for the themed View component.
 * Extends React Native's View props with theming capabilities.
 */
export type ViewProps = ThemeProps &
  DefaultView["props"] & {
    /** Visual variant that determines the background color */
    variant?: "default" | "surface";
  };

/**
 * A themed Text component that automatically adapts to light/dark modes.
 * 
 * This component wraps React Native's Text component and automatically applies
 * the appropriate colors based on the current theme. It supports different
 * visual variants and custom color overrides.
 * 
 * @param variant - The visual style variant (affects color)
 * @param lightColor - Custom color override for light theme
 * @param darkColor - Custom color override for dark theme
 * @param style - Additional styles to apply
 * @param otherProps - All other React Native Text props
 * 
 * @example
 * ```tsx
 * // Basic usage with theme colors
 * <Text>Default text</Text>
 * <Text variant="secondary">Secondary text</Text>
 * <Text variant="accent">Accent text</Text>
 * 
 * // Custom colors
 * <Text lightColor="#000" darkColor="#fff">
 *   Custom colored text
 * </Text>
 * ```
 */
export function Text({
  variant = "default",
  style,
  lightColor,
  darkColor,
  ...otherProps
}: TextProps) {
  const colorMap = {
    default: "text",
    secondary: "textSecondary",
    muted: "textMuted",
    accent: "tint",
  } as const;

  const color = useThemeColor(
    { light: lightColor, dark: darkColor },
    colorMap[variant]
  );

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

/**
 * A themed View component that automatically adapts to light/dark modes.
 * 
 * This component wraps React Native's View component and automatically applies
 * the appropriate background colors based on the current theme. It supports
 * different visual variants and custom color overrides.
 * 
 * @param variant - The visual style variant (affects background color)
 * @param lightColor - Custom background color override for light theme
 * @param darkColor - Custom background color override for dark theme
 * @param style - Additional styles to apply
 * @param otherProps - All other React Native View props
 * 
 * @example
 * ```tsx
 * // Basic usage with theme colors
 * <View>Default background</View>
 * <View variant="surface">Surface background</View>
 * 
 * // Custom colors
 * <View lightColor="#f0f0f0" darkColor="#333">
 *   Custom colored container
 * </View>
 * ```
 */
export function View({
  variant = "default",
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ViewProps) {
  const { colors } = useTheme();

  const backgroundColorMap = {
    default: "background",
    surface: "surface",
  } as const;

  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    backgroundColorMap[variant]
  );

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}
