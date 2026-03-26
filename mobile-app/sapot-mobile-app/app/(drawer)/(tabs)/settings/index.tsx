import { Peer } from "@/features/shared";
import { useUserProfile } from "@/features/shared/hooks";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Avatar, Icon, Text, useTheme } from "react-native-paper";
import { SETTINGS_ROUTES } from "@/app/routes";
import { useThemePreference } from "@/features/shared/context";

export default function Settings() {
  const theme = useTheme();
  const { user, isGuest } = useUserProfile();
  const { themeChoice } = useThemePreference();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.background,
            paddingHorizontal: 20,
            paddingVertical: 16,
            gap: 8,
            borderRadius: 8,
          }}
        >
          <Avatar.Text
            size={60}
            label={user.username[0].toUpperCase()}
            style={{ backgroundColor: theme.colors.primary }}
          />
          <View style={{ flex: 1 }}>
            <Text
              variant="headlineSmall"
              style={{
                color: theme.colors.onPrimaryContainer,
                fontWeight: "bold",
              }}
            >
              {user.username}
            </Text>
            {!isGuest && user instanceof Peer && user.email && (
              <>
                <Text
                  variant="titleSmall"
                  style={{
                    color: theme.colors.onTertiary,
                    fontWeight: "semibold",
                  }}
                >
                  {user.email}
                </Text>
                <Text>Account ID</Text>
              </>
            )}
          </View>
        </View>
        <Text>Account</Text>
        <View
          style={{ backgroundColor: theme.colors.background, borderRadius: 4 }}
        >
          <Link href={SETTINGS_ROUTES.MANAGE_PROFILE}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="account-circle-outline" size={24} />
                <Text>Manage Profile</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
          <Link href={SETTINGS_ROUTES.PASSWORD_AND_SECURITY}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="account-circle-outline" size={24} />
                <Text>Password & Security</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
        </View>
        <Text>Account</Text>
        <View
          style={{ backgroundColor: theme.colors.background, borderRadius: 4 }}
        >
          <Link href={SETTINGS_ROUTES.THEME}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="format-paint" size={24} />
                <Text>Theme</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text>
                  {themeChoice.charAt(0).toUpperCase() + themeChoice.slice(1)}
                </Text>
                <Icon source="arrow-right" size={24} />
              </View>
            </View>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  item: {
    justifyContent: "space-between",
    flexDirection: "row",
    width: "100%",
    padding: 16,
  },
});
