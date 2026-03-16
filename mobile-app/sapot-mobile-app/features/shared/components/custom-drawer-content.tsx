import { useAuth } from "@/features/auth";
import {
  DrawerContentComponentProps,
  DrawerItem,
  DrawerItemList,
} from "@react-navigation/drawer";
import React from "react";
import { ScrollView, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Icon,
  Text,
  useTheme,
} from "react-native-paper";
import { useUserProfile } from "../hooks";

export function CustomDrawerContent(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const auth = useAuth();
  const { user } = useUserProfile();

  if (!auth) {
    return <ActivityIndicator />;
  }

  const { isAuthenticated, logout, logoutAsGuest } = auth;

  const handleEditProfile = () => {
    console.log("Edit profile pressed");
  };

  const handleLogout = async () => {
    if (isAuthenticated) {
      await logout();
    } else {
      await logoutAsGuest();
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{}} contentContainerStyle={{}}>
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
            <Avatar.Text
              size={60}
              label={user.username[0].toUpperCase()}
              style={{ backgroundColor: theme.colors.primary }}
            />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text
                variant="headlineSmall"
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
              label="Logout"
              onPress={handleLogout}
              icon={({ color, size }) => (
                <Icon source="exit-to-app" color={color} size={size ?? 24} />
              )}
              style={{ marginHorizontal: 0, borderRadius: 0 }}
            />
          </View>
        </View>

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
    </View>
  );
}
