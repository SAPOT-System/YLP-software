import { SETTINGS_ROUTES } from "@/config/routes";
import { GuestLogoutWarningModal, useAuth } from "@/features/auth";
import { Peer } from "@/features/shared";
import { useThemePreference } from "@/features/shared/core/context";
import { useProfilePhoto, useUserProfile } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/core/utils/logger";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Avatar, Icon, Text, useTheme } from "react-native-paper";

export default function Settings() {
  const theme = useTheme();
  const { user, isGuest } = useUserProfile();
  const { themeChoice } = useThemePreference();
  const { isAuthenticated, logout, logoutAsGuest } = useAuth();
  const itemColor = theme.dark ? "#E6ECF5" : "#000";
  const { url: profilePicUrl } = useProfilePhoto();
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);

  useEffect(() => {
    uiLog.info("[Settings] mounted");
    return () => {
      uiLog.info("[Settings] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[Settings] useEffect triggered, deps:", {
      isAuthenticated,
      isGuest,
      themeChoice,
    });
  }, [isAuthenticated, isGuest, themeChoice]);

  if (!user) return null;

  const handleLogout = async () => {
    uiLog.debug("[Settings] handleLogout called", { isAuthenticated, isGuest });
    if (isGuest) {
      setShowLogoutWarning(true);
      return;
    }
    try {
      if (isAuthenticated) {
        await logout();
      } else {
        await logoutAsGuest();
      }
    } catch (error) {
      uiLog.error("[Settings] Error in handleLogout", { error });
      throw error;
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
          {profilePicUrl ? (
            <Avatar.Image size={60} source={{ uri: profilePicUrl }} />
          ) : (
            <Avatar.Text
              size={60}
              label={(user.username?.[0]?.toUpperCase()) ?? "?"}
              style={{ backgroundColor: theme.colors.primary }}
            />
          )}
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
        <Text style={{ color: "#696969" }}>Account</Text>
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
                <Icon
                  source="account-circle-outline"
                  size={24}
                  color={itemColor}
                />
                <Text style={{ color: itemColor }}>Manage Profile</Text>
              </View>
              <Icon source="arrow-right" size={24} color={itemColor} />
            </View>
          </Link>
          {!isGuest && (
            <Link href={SETTINGS_ROUTES.SWITCH_MODE}>
              <View style={styles.item}>
                <View style={styles.itemContainer}>
                  <Icon source="nintendo-switch" size={24} color={itemColor} />
                  <Text style={{ color: itemColor }}>Switch Mode</Text>
                </View>
                <Icon source="arrow-right" size={24} color={itemColor} />
              </View>
            </Link>
          )}
          {isGuest ? (
            <Link href={SETTINGS_ROUTES.AUTHENTICATE}>
              <View style={styles.item}>
                <View style={styles.itemContainer}>
                  <Icon source="account-check" size={24} color={itemColor} />
                  <Text style={{ color: itemColor }}>Authenticate</Text>
                </View>
                <Icon source="arrow-right" size={24} color={itemColor} />
              </View>
            </Link>
          ) : (
            <>
              <Link href={SETTINGS_ROUTES.PASSWORD_AND_SECURITY}>
                <View style={styles.item}>
                  <View style={styles.itemContainer}>
                    <Icon source="lock" size={24} color={itemColor} />
                    <Text style={{ color: itemColor }}>
                      Password & Security
                    </Text>
                  </View>
                  <Icon source="arrow-right" size={24} color={itemColor} />
                </View>
              </Link>
            </>
          )}
          <Link href={SETTINGS_ROUTES.QR_CODE}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="qrcode" size={24} color={itemColor} />
                <Text style={{ color: itemColor }}>QR Code</Text>
              </View>
              <Icon source="arrow-right" size={24} color={itemColor} />
            </View>
          </Link>
        </View>
        <Text style={{ color: "#696969" }}>Preferences</Text>
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
                <Icon source="format-paint" size={24} color={itemColor} />
                <Text style={{ color: itemColor }}>Theme</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: itemColor }}>
                  {themeChoice.charAt(0).toUpperCase() + themeChoice.slice(1)}
                </Text>
                <Icon source="arrow-right" size={24} color={itemColor} />
              </View>
            </View>
          </Link>
          {!isGuest && (
            <Link href={SETTINGS_ROUTES.GPS}>
              <View style={styles.item}>
                <View style={styles.itemContainer}>
                  <Icon source="map-marker" size={24} color={itemColor} />
                  <Text style={{ color: itemColor }}>GPS</Text>
                </View>
                <Icon source="arrow-right" size={24} color={itemColor} />
              </View>
            </Link>
          )}
        </View>
        <Text style={{ color: "#696969" }}>Support</Text>
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          <Link href={SETTINGS_ROUTES.ABOUT_US}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="information-outline" size={24} color={itemColor} />
                <Text style={{ color: itemColor }}>About Us</Text>
              </View>
              <Icon source="arrow-right" size={24} color={itemColor} />
            </View>
          </Link>
          <Pressable onPress={handleLogout}>
            <View style={styles.item}>
              <View style={styles.itemContainer}>
                <Icon source="exit-to-app" size={24} color={itemColor} />
                <Text style={{ color: itemColor }}>Logout</Text>
              </View>
              <Icon source="arrow-right" size={24} color={itemColor} />
            </View>
          </Pressable>
        </View>
      </ScrollView>
      <GuestLogoutWarningModal
        visible={showLogoutWarning}
        onLogout={logoutAsGuest}
        onDismiss={() => setShowLogoutWarning(false)}
      />
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
