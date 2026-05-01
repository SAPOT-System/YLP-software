import { SETTINGS_ROUTES } from "@/config/routes";
import { uiLog } from "@/features/shared/utils/logger";
import { Link } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

export default function PasswordAndSecurity() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[PasswordAndSecurity] mounted");
    return () => {
      uiLog.info("[PasswordAndSecurity] unmounted");
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontWeight: "semibold" }}>Login & Recovery</Text>
        <Text variant="bodySmall">
          Manage your passwords, login preferences and recovery methods
        </Text>
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: 4,
            marginTop: 12,
          }}
        >
          <Link href={SETTINGS_ROUTES.CHANGE_PASSWORD}>
            <View style={styles.item}>
              <Text>Change Password</Text>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    justifyContent: "space-between",
    flexDirection: "row",
    width: "100%",
    padding: 16,
  },
});
