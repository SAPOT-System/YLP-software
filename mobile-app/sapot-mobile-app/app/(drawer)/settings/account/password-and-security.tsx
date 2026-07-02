import { SETTINGS_ROUTES } from "@/config/routes";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { uiLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Divider, Icon, Text, useTheme } from "react-native-paper";

export default function PasswordAndSecurity() {
  const theme = useTheme();
  const { localEncryptionService } = useMainContainer();
  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    uiLog.info("[PasswordAndSecurity] mounted");

    localEncryptionService.isPINEnabled().then((enabled) => {
      setPinEnabled(enabled);
    });

    return () => {
      uiLog.info("[PasswordAndSecurity] unmounted");
    };
  }, [localEncryptionService]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontWeight: "600" }}>Login & Recovery</Text>
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
          <Pressable
            onPress={() =>
              router.push(SETTINGS_ROUTES.CHANGE_PASSWORD)
            }
          >
            <View style={styles.item}>
              <Text>Change Password</Text>
              <Icon source="arrow-right" size={24} />
            </View>
          </Pressable>
          <Divider />
          <Pressable
            onPress={() =>
              router.push(SETTINGS_ROUTES.SECURITY_QUESTION)
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
              router.push(SETTINGS_ROUTES.GENERATE_RECOVERY_KEY)
            }
          >
            <View style={styles.item}>
              <Text>Generate Recovery Key</Text>
              <Icon source="arrow-right" size={24} />
            </View>
          </Pressable>
          <Divider />
          <Pressable
            onPress={() =>
              router.push(SETTINGS_ROUTES.ENCRYPTION_PIN)
            }
          >
            <View style={styles.item}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text>Encryption PIN</Text>
                {pinEnabled !== null && (
                  <Text
                    variant="labelSmall"
                    style={{
                      color: pinEnabled
                        ? theme.colors.primary
                        : theme.colors.onSurfaceVariant,
                    }}
                  >
                    {pinEnabled ? "On" : "Off"}
                  </Text>
                )}
              </View>
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
