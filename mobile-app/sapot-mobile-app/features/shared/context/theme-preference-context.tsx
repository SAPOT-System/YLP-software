import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemeChoice = "light" | "dark" | "system";
type AppTheme = "light" | "dark";

type ThemePreferenceContextValue = {
  themeChoice: ThemeChoice;
  setThemeChoice: (choice: ThemeChoice) => void;
  resolvedTheme: AppTheme;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(
  null
);

export function ThemePreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemTheme = useColorScheme();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");

  const resolvedTheme: AppTheme =
    themeChoice === "system" ? (systemTheme === "dark" ? "dark" : "light") : themeChoice;

  const value = useMemo(
    () => ({
      themeChoice,
      setThemeChoice,
      resolvedTheme,
    }),
    [themeChoice, resolvedTheme]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);

  if (!context) {
    throw new Error(
      "useThemePreference must be used within ThemePreferenceProvider"
    );
  }

  return context;
}
