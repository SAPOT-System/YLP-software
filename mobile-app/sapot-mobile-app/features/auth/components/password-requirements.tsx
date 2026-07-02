import React from "react";
import { View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

interface PasswordRequirementsProps {
  password: string;
}

const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

export const PasswordRequirements = ({ password }: PasswordRequirementsProps) => {
  const theme = useTheme();

  if (!password.length) return null;

  return (
    <View style={{ marginTop: 4, marginBottom: 8, gap: 2 }}>
      {RULES.map((rule) => {
        const met = rule.test(password);
        const color = met ? theme.colors.primary : theme.colors.onSurfaceVariant;
        return (
          <View key={rule.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon source={met ? "check-circle-outline" : "circle-outline"} size={14} color={color} />
            <Text variant="bodySmall" style={{ color }}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
