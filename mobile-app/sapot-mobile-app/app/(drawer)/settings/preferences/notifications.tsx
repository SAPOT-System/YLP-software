import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function SwitchMode() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[NotificationsSettings] mounted");
    return () => {
      uiLog.info("[NotificationsSettings] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text>Notifications</Text>
      </View>
    </View>
  );
}
