import { ThemeChoice, useThemePreference } from "@/features/shared/core/context";
import { uiLog } from "@/features/shared/core/utils/logger";
import React, { useEffect } from "react";
import { View } from "react-native";
import { RadioButton, Text, useTheme } from "react-native-paper";

const ThemeScreen = () => {
  const theme = useTheme();
  const { themeChoice, setThemeChoice } = useThemePreference();

  useEffect(() => {
    uiLog.info("[ThemeScreen] mounted");
    return () => {
      uiLog.info("[ThemeScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[ThemeScreen] useEffect triggered, deps:", { themeChoice });
  }, [themeChoice]);

  const handleThemeChange = (newValue: string) => {
    uiLog.debug("[ThemeScreen] handleThemeChange called", {
      newValue,
    });
    if (
      newValue === "light" ||
      newValue === "dark" ||
      newValue === "system"
    ) {
      setThemeChoice(newValue as ThemeChoice);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <RadioButton.Group
          onValueChange={handleThemeChange}
          value={themeChoice}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <RadioButton value="light" />
            <Text>Light</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <RadioButton value="dark" />
            <Text>Dark</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <RadioButton value="system" />
            <Text>Use system settings</Text>
          </View>
        </RadioButton.Group>
      </View>
    </View>
  );
};

export default ThemeScreen;
