import { uiLog } from "@/features/shared/core/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function SwitchMode() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[HelpCenter] mounted");
    return () => {
      uiLog.info("[HelpCenter] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text>Help Center</Text>
      </View>
    </View>
  );
}
