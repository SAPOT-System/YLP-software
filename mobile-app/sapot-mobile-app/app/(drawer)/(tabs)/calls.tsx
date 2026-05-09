import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";

export default function Calls() {
  useEffect(() => {
    uiLog.info("[Calls] mounted");
    return () => {
      uiLog.info("[Calls] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text>Calls</Text>
    </View>
  );
}
