import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function Contacts() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[Authenticate] mounted");
    return () => {
      uiLog.info("[Authenticate] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text>Authenticate</Text>
      </View>
    </View>
  );
}
