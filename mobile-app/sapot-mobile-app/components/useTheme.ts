import { useMemo } from "react";
import Colors, { type ColorScheme } from "@/constants/Colors";
import { useColorScheme } from "./useColorScheme";

/**
 * Hook that provides the current theme information including colors and dark mode status.
 * 
 * This hook automatically detects the user's preferred color scheme (light/dark)
 * and returns the appropriate theme data. 
 * 
 * @returns Object containing theme information
 * @returns {boolean} isDark - Whether dark mode is currently active
 * @returns {ColorScheme} colors - Color palette for the current theme
 * @returns {'light' | 'dark'} colorScheme - Current color scheme name
 * 
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { isDark, colors, colorScheme } = useTheme();
 *   
 *   return (
 *     <View style={{ backgroundColor: colors.background }}>
 *       <Text style={{ color: colors.text }}>
 *         Current theme: {colorScheme}
 *       </Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useTheme() {
  const colorScheme = useColorScheme() ?? "light";

  return useMemo(
    () => ({
      isDark: colorScheme === "dark",
      colors: Colors[colorScheme],
      colorScheme,
    }),
    [colorScheme]
  );
}

/**
 * Hook that returns a specific color value, with support for custom light/dark overrides.
 * 
 * This hook is useful when you need a specific color that can be customized per component
 * while still falling back to the theme's default colors. It prioritizes custom colors
 * over theme defaults.
 * 
 * @param props - Custom color overrides for light and dark themes
 * @param props.light - Custom color to use in light theme (optional)
 * @param props.dark - Custom color to use in dark theme (optional)
 * @param colorName - Name of the color from the theme palette to use as fallback
 * @returns The resolved color string
 * 
 * @example
 * ```typescript
 * function CustomButton() {
 *   // Uses custom colors if provided, falls back to theme's 'tint' color
 *   const buttonColor = useThemeColor(
 *     { light: '#FF0000', dark: '#FF6666' },
 *     'tint'
 *   );
 *   
 *   return (
 *     <TouchableOpacity style={{ backgroundColor: buttonColor }}>
 *       <Text>Custom Button</Text>
 *     </TouchableOpacity>
 *   );
 * }
 * ```
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ColorScheme
) {
  const { colors, colorScheme } = useTheme();
  const colorFromProps = props[colorScheme];

  return colorFromProps || colors[colorName];
}
