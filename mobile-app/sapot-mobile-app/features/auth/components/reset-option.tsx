import { router } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

interface ResetOptionProps {
  option: "email" | "sms" | "question" | "recoveryKey";
}

const resetOptionData = {
  email: {
    link: "/getting-started/email-reset",
    title: "Reset via email",
    description: "If you have email linked to account",
    icon: "email",
  },
  sms: {
    link: "/getting-started/sms-reset",
    title: "Reset via SMS",
    description: "If you have number linked to account",
    icon: "cellphone",
  },
  question: {
    link: "/getting-started/enter-identifier",
    title: "Verify your Identity",
    description: "Answer security questions to confirm your identity",
    icon: "question",
  },
  recoveryKey: {
    link: "/getting-started/enter-identifier",
    title: "Verify your Identity",
    description: "Answer security questions to confirm your identity",
    icon: "question",
  },
} as const;

export const ResetOption = ({ option }: ResetOptionProps) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: resetOptionData[option].link,
          params: { resetOption: option },
        })
      }
      style={({ pressed }) => [
        {
          backgroundColor: pressed
            ? theme.colors.elevation.level5
            : theme.colors.inverseOnSurface,
          borderRadius: 30,
          paddingHorizontal: 16,
          paddingVertical: 24,
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
        },
      ]}
    >
      <Icon source={resetOptionData[option].icon} size={24} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          variant="bodyLarge"
          style={{
            color: theme.colors.primary,
            fontWeight: "bold",
          }}
          numberOfLines={1}
        >
          {resetOptionData[option].title}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onPrimaryContainer }}
          numberOfLines={1}
        >
          {resetOptionData[option].description}
        </Text>
      </View>
    </Pressable>
  );
};
