import { uiLog } from "@/features/shared/core/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function Contacts() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[Contacts] mounted");
    return () => {
      uiLog.info("[Contacts] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text>Contacts</Text>
      </View>
    </View>
  );
}
