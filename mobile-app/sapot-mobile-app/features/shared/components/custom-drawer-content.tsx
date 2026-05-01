import { SETTINGS_ROUTES } from "@/app/routes";
import { GuestLogoutWarningModal, useAuth } from "@/features/auth";
import {
  DrawerContentComponentProps,
  DrawerItem,
  DrawerItemList,
} from "@react-navigation/drawer";
import { getApiUrl, setRuntimeHostOverride } from "@/config/runtime";
import { apiClient } from "@/features/shared/api/client";
import {
  getServerHostOverride,
  saveServerHostOverride,
} from "@/features/shared/stores/secure-config";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Icon,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useMainContainer, useProfilePhoto, useUserProfile } from "../hooks";
import { useSyncService } from "../hooks/use-sync-service";
import { uiLog } from "../utils/logger";

uiLog.debug("[custom-drawer-content] module loaded");

function ServerHostInput() {
  const theme = useTheme();
  const [host, setHost] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const defaultHost = getApiUrl().replace(/^https?:\/\//, "").split(":")[0];
    getServerHostOverride().then((stored) => {
      setHost(stored ?? defaultHost);
    });
  }, []);

  const handleSave = async () => {
    const trimmed = host.trim() || null;
    setRuntimeHostOverride(trimmed);
    await saveServerHostOverride(trimmed);
    apiClient.defaults.baseURL = getApiUrl();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    uiLog.info("drawer › server host override saved", { host: trimmed });
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
      >
        SERVER HOST OVERRIDE
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          mode="outlined"
          dense
          placeholder="e.g. 192.168.1.50"
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ flex: 1, fontSize: 13 }}
          right={
            saved ? (
              <TextInput.Icon icon="check" color={theme.colors.primary} />
            ) : undefined
          }
        />
        <Button mode="contained" compact onPress={handleSave}>
          Save
        </Button>
      </View>
    </View>
  );
}

export function CustomDrawerContent(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const auth = useAuth();
  const syncService = useSyncService();
  const { appModeStore } = useMainContainer();
  const { user, isGuest } = useUserProfile();
  const { url: profilePicUrl } = useProfilePhoto();
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, logout, logoutAsGuest } = auth;
  const isLan = appModeStore.getEffectiveMode(!isAuthenticated) === "lan";

  const handleEditProfile = () => {
    uiLog.info("drawer › edit profile pressed");
  };

  const handleLogout = async () => {
    uiLog.info("drawer › logout pressed", { isAuthenticated, isGuest });
    if (isGuest) {
      setShowLogoutWarning(true);
      return;
    }
    if (isAuthenticated) {
      await logout();
    } else {
      await logoutAsGuest();
    }
  };

  const handleSyncNow = async () => {
    uiLog.info("drawer › sync now pressed");
    await syncService.syncNow();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      
      behavior={Platform.OS === "ios" 
        ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 20}
    >
      <GuestLogoutWarningModal
        visible={showLogoutWarning}
        onLogout={logoutAsGuest}
        onDismiss={() => setShowLogoutWarning(false)}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {/* User Profile Section */}
        <View
          style={{
            padding: 20,
            paddingBottom: 40,
            backgroundColor: theme.colors.background,
            marginBottom: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            {profilePicUrl ? (
              <Avatar.Image size={60} source={{ uri: profilePicUrl }} />
            ) : (
              <Avatar.Text
                size={60}
                label={(user.username[0] ?? "?").toUpperCase()}
                style={{ backgroundColor: theme.colors.primary }}
              />
            )}
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text
                variant="titleLarge"
                style={{
                  color: theme.colors.onPrimaryContainer,
                  fontWeight: "bold",
                }}
              >
                {user.username}
              </Text>
              <Text
                variant="titleSmall"
                style={{
                  color: theme.colors.onTertiary,
                  fontWeight: "bold",
                }}
              >
                Connected to NONE
              </Text>
            </View>
          </View>
          <Button
            icon="pencil"
            mode="outlined"
            onPress={handleEditProfile}
            compact
            style={{ width: 136, height: 29 }}
            contentStyle={{ height: 29, paddingHorizontal: 8 }}
            labelStyle={{
              fontSize: 14,
              lineHeight: 14,
              marginVertical: 0,
              color: theme.colors.primary,
            }}
          >
            Edit Profile
          </Button>
        </View>
        <View>
          <Text style={{ padding: 10 }}>SHORTCUTS</Text>
          <View
            style={{
              paddingLeft: 20,
              backgroundColor: theme.colors.background,
            }}
          >
            {/* Default Drawer Items */}
            <DrawerItemList {...props} />

            <DrawerItem
              label="Switch Mode"
              onPress={() =>
                router.push({
                  pathname: SETTINGS_ROUTES.SWITCH_MODE,
                  params: { fromDrawer: "1" },
                })
              }
              icon={({ color, size }) => (
                <Icon
                  source="nintendo-switch"
                  color={color}
                  size={size ?? 24}
                />
              )}
              style={{ marginHorizontal: 0, borderRadius: 0 }}
            />
            {isAuthenticated && (
              <DrawerItem
                label="GPS"
                onPress={() =>
                  router.push({
                    pathname: SETTINGS_ROUTES.GPS,
                    params: { fromDrawer: "1" },
                  })
                }
                icon={({ color, size }) => (
                  <Icon source="map-marker" color={color} size={size ?? 24} />
                )}
                style={{ marginHorizontal: 0, borderRadius: 0 }}
              />
            )}
            <DrawerItem
              label="Theme"
              onPress={() =>
                router.push({
                  pathname: SETTINGS_ROUTES.THEME,
                  params: { fromDrawer: "1" },
                })
              }
              icon={({ color, size }) => (
                <Icon source="format-paint" color={color} size={size ?? 24} />
              )}
              style={{ marginHorizontal: 0, borderRadius: 0 }}
            />
            {!isLan && (
              <DrawerItem
                label="Sync"
                onPress={handleSyncNow}
                icon={({ color, size }) => (
                  <Icon source="seed" color={color} size={size ?? 24} />
                )}
                style={{ marginHorizontal: 0, borderRadius: 0 }}
              />
            )}
            <DrawerItem
              label="Logout"
              onPress={handleLogout}
              icon={({ color, size }) => (
                <Icon source="exit-to-app" color={color} size={size ?? 24} />
              )}
              style={{ marginHorizontal: 0, borderRadius: 0 }}
            />
          </View>
        </View>

        <ServerHostInput />

        {/* Additional Custom Items */}
        {/* <View style={{ padding: 16 }}>
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.onSurfaceVariant,
            textAlign: "center",
          }}
        >
          SAPOT v1.0.0
        </Text>
      </View> */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
