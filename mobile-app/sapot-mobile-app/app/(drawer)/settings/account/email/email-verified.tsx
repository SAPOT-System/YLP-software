import { SETTINGS_ROUTES } from "@/config/routes";
import { uiLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Button, Icon, Text, useTheme } from "react-native-paper";

export default function EmailVerified() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[EmailVerified] mounted");
    return () => {
      uiLog.info("[EmailVerified] unmounted");
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.secondary,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        gap: 20,
      }}
    >
      <Icon source="check-circle-outline" size={80} color="#22C55E" />
      <Text
        style={{
          fontSize: 22,
          fontWeight: "bold",
          textAlign: "center",
          color: theme.dark ? "#E6ECF5" : "#000000",
        }}
      >
        Email address verified!
      </Text>
      <Text
        style={{
          fontSize: 15,
          textAlign: "center",
          color: theme.dark ? "#9BA8C0" : "#6B7280",
        }}
      >
        Your email address has been successfully verified.
      </Text>
      <Button
        mode="contained"
        style={{ width: 164, marginTop: 8 }}
        onPress={() => {
          uiLog.info("[EmailVerified] navigating to ManageProfile");
          router.replace(SETTINGS_ROUTES.MANAGE_PROFILE);
        }}
      >
        Done
      </Button>
    </View>
  );
}
