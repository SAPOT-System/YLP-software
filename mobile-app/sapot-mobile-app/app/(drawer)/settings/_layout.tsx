import { APP_ROUTES, SETTINGS_ROUTES } from "@/app/routes";
import { router, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { Appbar, useTheme } from "react-native-paper";

export default function SettingsLayout() {
  const theme = useTheme();
  const pathname = usePathname();
  const { fromDrawer } = useGlobalSearchParams<{ fromDrawer?: string }>();

  const removeRouteGroups = (path: string) => path.replace(/\/\([^/]+\)/g, "");

  const normalizedPathname = removeRouteGroups(pathname);

  const topLevelSettingsRoutes = new Set<string>([
    removeRouteGroups(SETTINGS_ROUTES.MANAGE_PROFILE),
    removeRouteGroups(SETTINGS_ROUTES.PASSWORD_AND_SECURITY),
    removeRouteGroups(SETTINGS_ROUTES.THEME),
    removeRouteGroups(SETTINGS_ROUTES.AUTHENTICATE),
    removeRouteGroups(SETTINGS_ROUTES.CONTACTS),
    removeRouteGroups(SETTINGS_ROUTES.QR_CODE),
    removeRouteGroups(SETTINGS_ROUTES.SWITCH_MODE),
    removeRouteGroups(SETTINGS_ROUTES.GPS),
    removeRouteGroups(SETTINGS_ROUTES.NOTIFICATIONS),
    removeRouteGroups(SETTINGS_ROUTES.ABOUT_US),
    removeRouteGroups(SETTINGS_ROUTES.HELP_CENTER),
  ]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: ({ options }) => (
          <Appbar.Header statusBarHeight={0} style={{ height: 80 }}>
            <Appbar.BackAction
              onPress={() => {
                const isTopLevelSettingsRoute =
                  topLevelSettingsRoutes.has(normalizedPathname);

                if (isTopLevelSettingsRoute && fromDrawer !== "1") {
                  router.replace(APP_ROUTES.SETTINGS);
                  return;
                }

                if (fromDrawer == "1") {
                  router.replace(APP_ROUTES.HOME);
                  return;
                }

                router.back();
              }}
            />
            <Appbar.Content
              titleStyle={{
                fontWeight: "bold",
                color: theme.colors.onBackground,
                fontSize: 24,
              }}
              title={options.title ?? "Settings"}
            />
          </Appbar.Header>
        ),
      }}
    >
      <Stack.Screen
        name="account/manage-profile"
        options={{
          title: "Manage Profile",
        }}
      />
      <Stack.Screen
        name="account/password-and-security"
        options={{
          title: "Password & Security",
        }}
      />
      <Stack.Screen
        name="account/change-password"
        options={{
          title: "Change Password",
        }}
      />
      <Stack.Screen
        name="account/authenticate"
        options={{
          title: "Authenticate",
        }}
      />
      <Stack.Screen
        name="account/contacts"
        options={{
          title: "Contacts",
        }}
      />
      <Stack.Screen
        name="account/qr-code"
        options={{
          title: "QR Code",
        }}
      />
      <Stack.Screen
        name="account/email/update-email"
        options={{
          title: "Email Address",
        }}
      />
      <Stack.Screen
        name="account/email/verify-email"
        options={{
          title: "Verify with Email Address",
        }}
      />
      <Stack.Screen
        name="account/switch-mode"
        options={{
          title: "Switch Mode",
        }}
      />
      <Stack.Screen
        name="preferences/theme"
        options={{
          title: "Theme",
        }}
      />
      <Stack.Screen
        name="preferences/notifications"
        options={{
          title: "Notifications",
        }}
      />
      <Stack.Screen
        name="preferences/gps"
        options={{
          title: "GPS",
        }}
      />
      <Stack.Screen
        name="support/about-us"
        options={{
          title: "About Us",
        }}
      />
      <Stack.Screen
        name="support/help-center"
        options={{
          title: "Help Center",
        }}
      />
    </Stack>
  );
}
