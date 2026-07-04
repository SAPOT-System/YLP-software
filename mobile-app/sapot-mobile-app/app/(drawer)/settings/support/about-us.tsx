import { IS_DEBUG_ENABLED } from "@/config/debug";
import { useDebugPanel } from "@/features/debug";
import { uiLog } from "@/features/shared/core/utils/logger";
import Constants from "expo-constants";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

const VERSION_TAP_TARGET = 5;
const VERSION_TAP_WINDOW_MS = 2000;

export default function SwitchMode() {
  const theme = useTheme();
  const { open } = useDebugPanel();
  const tapCountRef = useRef(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    uiLog.info("[AboutUs] mounted");
    return () => {
      uiLog.info("[AboutUs] unmounted");
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  const handleVersionPress = () => {
    if (!IS_DEBUG_ENABLED) return;

    tapCountRef.current += 1;
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

    if (tapCountRef.current >= VERSION_TAP_TARGET) {
      tapCountRef.current = 0;
      uiLog.info("[AboutUs] debug panel opened via version tap");
      open();
      return;
    }

    tapTimeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, VERSION_TAP_WINDOW_MS);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text>About Us</Text>
        <Pressable onPress={handleVersionPress}>
          <Text style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
            SAPOT v{Constants.expoConfig?.extra?.displayVersion}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
