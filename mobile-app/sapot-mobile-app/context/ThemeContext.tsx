import React, { createContext, useContext, useState } from "react";
import { useColorScheme as useDeviceColorScheme } from "react-native";
import Colors, { ColorScheme } from "@/constants/Colors";

/**
 * Available theme modes for the application.
 * - 'light': Always use light theme
 * - 'dark': Always use dark theme
 * - 'auto': Follow device's system preference
 */
type ThemeMode = "light" | "dark" | "auto";

/**
 * Shape of the theme context value provided to child components.
 * Contains all theme-related state and methods for theme management.
 */
interface ThemeContextType {
  /** Current theme mode setting */
  mode: ThemeMode;
  /** Whether dark theme is currently active */
  isDark: boolean;
  /** Color palette for the current active theme */
  colors: ColorScheme;
  /** Function to change the theme mode */
  setThemeMode: (mode: ThemeMode) => void;
}

/**
 * React context for managing application theme state.
 * Provides theme information to all child components.
 */
const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * Theme provider component that manages theme state and provides it to child components.
 *
 * This provider handles automatic theme switching based on device preferences
 * when in 'auto' mode, and manual theme control when in 'light' or 'dark' modes.
 *
 * @param children - React components that will have access to theme context
 *
 * @example
 * ```tsx
 * // Wrap app with the theme provider
 * function App() {
 *   return (
 *     <ThemeProvider>
 *       <NavigationContainer>
 *         <RootNavigator />
 *       </NavigationContainer>
 *     </ThemeProvider>
 *   );
 * }
 * ```
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const deviceColorScheme = useDeviceColorScheme() ?? "light";

  // Determine the actual theme to use based on mode setting
  const actualScheme = mode === "auto" ? deviceColorScheme : mode;
  const isDark = actualScheme === "dark";

  const value = React.useMemo(
    () => ({
      mode,
      isDark,
      colors: Colors[actualScheme],
      setThemeMode: setMode,
    }),
    [mode, actualScheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context and control theme settings.
 *
 * This hook provides access to the current theme state and theme switching
 * functionality. It must be used within a component that is wrapped by
 * the ThemeProvider.
 *
 * @returns Theme context value with current theme state and controls
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * function SettingsScreen() {
 *   const { mode, isDark, colors, setThemeMode } = useAppTheme();
 *
 *   return (
 *     <View style={{ backgroundColor: colors.background }}>
 *       <Text style={{ color: colors.text }}>
 *         Current mode: {mode}
 *       </Text>
 *       <Button
 *         title="Switch to Dark"
 *         onPress={() => setThemeMode('dark')}
 *       />
 *       <Button
 *         title="Switch to Light"
 *         onPress={() => setThemeMode('light')}
 *       />
 *       <Button
 *         title="Use Auto"
 *         onPress={() => setThemeMode('auto')}
 *       />
 *     </View>
 *   );
 * }
 * ```
 */
export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within ThemeProvider");
  }
  return context;
}
