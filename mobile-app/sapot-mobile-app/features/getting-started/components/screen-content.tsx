import { View } from "react-native";
import React from "react";
import { useTheme, Text } from "react-native-paper";

interface ScreenContentProps {
  title: string;
  description: string;
  children: React.ReactNode;
}
export const ScreenContent = ({
  title,
  description,
  children,
}: ScreenContentProps) => {
  const theme = useTheme();
  return (
    <View
      style={{
        marginTop: -30,
        width: "100%",
        borderTopRightRadius: 50,
        flex: 1,
        justifyContent: "flex-start",
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        paddingTop: 28,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{ color: theme.colors.onPrimaryContainer, fontWeight: "bold" }}
        variant="titleLarge"
      >
        {title}
      </Text>
      <Text
        style={{
          textAlign: "center",
          color: theme.colors.outline,
          marginBottom: 20,
        }}
        variant="bodySmall"
      >
        {description}
      </Text>
      {children}
    </View>
  );
};
