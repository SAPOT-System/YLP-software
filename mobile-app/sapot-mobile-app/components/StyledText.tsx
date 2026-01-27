import React from "react";
import { Text, TextProps } from "./Themed";

/**
 * Font family definitions for the application.
 * TODO: Define and add the actual fonts that will be used in the app.
 * Currently only includes SpaceMono for monospace text.
 */
const fontFamilies = {
  /** Monospace font for code or fixed-width text */
  mono: "SpaceMono",
  /** Default system font for regular text */
  regular: "System",
} as const;

/**
 * Standardized font sizes used throughout the application.
 * Provides consistent typography scaling across different text elements.
 */
const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
} as const;

/**
 * Props for the StyledText component.
 * Extends the themed Text component with typography-specific styling options.
 */
export type StyledTextProps = TextProps & {
  /** Font size variant from predefined scale */
  size?: keyof typeof fontSizes;
  /** Font weight for text emphasis */
  weight?: "normal" | "bold" | "500" | "600";
  /** Font family variant  */
  family?: keyof typeof fontFamilies;
};

/**
 * A styled text component that combines theming with typography controls.
 *
 * This component extends the themed Text component by adding standardized
 * font sizes, weights, and family options. It ensures consistent typography
 * throughout the application while maintaining theme support.
 *
 * @param size - Font size from the predefined scale (defaults to 'base')
 * @param weight - Font weight for text emphasis (defaults to 'normal')
 * @param family - Font family variant (defaults to 'regular')
 * @param style - Additional styles to merge with the typography styles
 * @param props - All other props from the themed Text component
 *
 * @example
 * ```tsx
 * // Different text sizes
 * <StyledText size="xs">Small caption text</StyledText>
 * <StyledText size="xl" weight="bold">Large heading</StyledText>
 *
 * // With theme variants
 * <StyledText size="lg" variant="accent" weight="600">
 *   Emphasized accent text
 * </StyledText>
 *
 * // Monospace text
 * <StyledText family="mono" size="sm">
 *   Code or fixed-width content
 * </StyledText>
 * ```
 */
export function StyledText({
  size = "base",
  weight = "normal",
  family = "regular",
  style,
  ...props
}: StyledTextProps) {
  return (
    <Text
      {...props}
      style={[
        {
          fontSize: fontSizes[size],
          fontWeight: weight,
          fontFamily: fontFamilies[family],
        },
        style,
      ]}
    />
  );
}
