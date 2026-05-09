import { SETTINGS_ROUTES } from "@/config/routes";
import { uiLog } from "@/features/shared/utils/logger";
import { Link, router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Divider, Icon, Text, useTheme } from "react-native-paper";

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
          <Divider />
          <Pressable
            onPress={() =>
              router.push(SETTINGS_ROUTES.SECURITY_QUESTION as never)
            }
          >
            <View style={styles.item}>
              <Text>Security Question</Text>
              <Icon source="arrow-right" size={24} />
            </View>
          </Pressable>
          <Divider />
          <Pressable
            onPress={() =>
              router.push(SETTINGS_ROUTES.GENERATE_RECOVERY_KEY as never)
            }
          >
            <View style={styles.item}>
              <Text>Generate Recovery Key</Text>
              <Icon source="arrow-right" size={24} />
            </View>
          </Pressable>
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
