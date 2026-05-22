import React from "react";
import { View } from "react-native";
import { useTheme } from "react-native-paper";

interface StepDotsProps {
  total: number;
  current: number;
}

export const StepDots = ({ total, current }: StepDotsProps) => {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 12,
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const isActive = i + 1 === current;
        return (
          <View
            key={i}
            style={{
              width: isActive ? 10 : 8,
              height: isActive ? 10 : 8,
              borderRadius: 5,
              backgroundColor: isActive
                ? theme.colors.primary
                : theme.colors.outlineVariant,
              marginHorizontal: 4,
            }}
          />
        );
      })}
    </View>
  );
};
