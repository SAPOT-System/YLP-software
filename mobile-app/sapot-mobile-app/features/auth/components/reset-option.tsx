import { AUTH_ROUTES } from "@/config/routes";
import { authLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

interface ResetOptionProps {
  option: "email" | "sms" | "question" | "recoveryKey";
}

const resetOptionData = {
  email: {
    link: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_IDENTIFIER,
    title: "Reset via email",
    description: "If you have an email linked to your account",
    icon: "email",
  },
  sms: {
    link: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_IDENTIFIER,
    title: "Reset via SMS",
    description: "If you have a phone number linked to your account",
    icon: "cellphone",
  },
  question: {
    link: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_IDENTIFIER,
    title: "Verify your Identity",
    description: "Answer security questions to confirm your identity",
    icon: "chat-question",
  },
  recoveryKey: {
    link: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_IDENTIFIER,
    title: "Use Recovery Keys",
    description:
      "Enter your recovery key, it was provided when you first created your account",
    icon: "key-variant",
  },
} as const;

export const ResetOption = ({ option }: ResetOptionProps) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        authLog.debug("[ResetOption] onPress triggered", { option });
        authLog.info("[Navigation] Navigating to EnterIdentifier", {
          screen: resetOptionData[option].link,
          resetOption: option,
        });
        router.push({
          pathname: resetOptionData[option].link,
          params: { resetOption: option },
        });
      }}
      style={({ pressed }) => [
        {
          backgroundColor: pressed
            ? theme.colors.secondaryContainer
            : theme.colors.secondary,
          borderRadius: 30,
          paddingHorizontal: 16,
          paddingVertical: 20,
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
        },
      ]}
    >
      <View
        style={{
          borderRadius: 24,
          padding: 8,
          backgroundColor: theme.colors.tertiary,
        }}
      >
        <Icon
          source={resetOptionData[option].icon}
          size={24}
          color={theme.colors.onSecondary}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          variant="bodyMedium"
          style={{
            color: theme.colors.onSecondary,
            fontWeight: "500",
          }}
        >
          {resetOptionData[option].title}
        </Text>
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.onTertiary,
          }}
        >
          {resetOptionData[option].description}
        </Text>
      </View>
      <Icon
        source="chevron-right"
        size={20}
        color={theme.colors.onSurfaceVariant}
      />
    </Pressable>
  );
};
