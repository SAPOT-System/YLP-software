import { Peer } from "@/features/shared";
import { useUserProfile } from "@/features/shared/hooks";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Icon,
  Text,
  useTheme,
} from "react-native-paper";
import { SETTINGS_ROUTES } from "@/app/routes";
import { useThemePreference } from "@/features/shared/context";
import { useAuth } from "@/features/auth";

export default function Settings() {
  const theme = useTheme();
  const { user, isGuest } = useUserProfile();
  const { themeChoice } = useThemePreference();
  const auth = useAuth();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, logout, logoutAsGuest } = auth;

  const handleLogout = async () => {
    if (isAuthenticated) {
      await logout();
    } else {
      await logoutAsGuest();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <ScrollView style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.background,
            paddingHorizontal: 20,
            paddingVertical: 16,
            gap: 8,
            borderRadius: 8,
            marginBottom: 16,
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
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: 4,
            marginBottom: 16,
          }}
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
          <Link href={SETTINGS_ROUTES.SWITCH_MODE}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="nintendo-switch" size={24} />
                <Text>Switch Mode</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
          {isGuest ? (
            <Link href={SETTINGS_ROUTES.AUTHENTICATE}>
              <View style={styles.item}>
                <View style={styles.itemContainer}>
                  <Icon source="account-check" size={24} />
                  <Text>Authenticate</Text>
                </View>
                <Icon source="arrow-right" size={24} />
              </View>
            </Link>
          ) : (
            <>
              <Link href={SETTINGS_ROUTES.PASSWORD_AND_SECURITY}>
                <View style={styles.item}>
                  <View style={styles.itemContainer}>
                    <Icon source="lock" size={24} />
                    <Text>Password & Security</Text>
                  </View>
                  <Icon source="arrow-right" size={24} />
                </View>
              </Link>
              <Link href={SETTINGS_ROUTES.CONTACTS}>
                <View style={styles.item}>
                  <View style={styles.itemContainer}>
                    <Icon source="contacts" size={24} />
                    <Text>Contacts</Text>
                  </View>
                  <Icon source="arrow-right" size={24} />
                </View>
              </Link>
            </>
          )}
          <Link href={SETTINGS_ROUTES.QR_CODE}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="qrcode" size={24} />
                <Text>QR Code</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
        </View>
        <Text>Preferences</Text>
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: 4,
            marginBottom: 16,
          }}
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
          {!isGuest && (
            <Link href={SETTINGS_ROUTES.GPS}>
              <View style={styles.item}>
                <View style={styles.itemContainer}>
                  <Icon source="map-marker" size={24} />
                  <Text>GPS</Text>
                </View>
                <Icon source="arrow-right" size={24} />
              </View>
            </Link>
          )}
          <Link href={SETTINGS_ROUTES.NOTIFICATIONS}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="bell" size={24} />
                <Text>Notifications</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
        </View>
        <Text>Support</Text>
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          <Link href={SETTINGS_ROUTES.HELP_CENTER}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="comment-question" size={24} />
                <Text>Help Center</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
          <Link href={SETTINGS_ROUTES.ABOUT_US}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="account-details" size={24} />
                <Text>About Us</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Link>
          <Pressable onPress={handleLogout}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="exit-to-app" size={24} />
                <Text>Logout</Text>
              </View>
              <Icon source="arrow-right" size={24} />
            </View>
          </Pressable>
        </View>
      </ScrollView>
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
