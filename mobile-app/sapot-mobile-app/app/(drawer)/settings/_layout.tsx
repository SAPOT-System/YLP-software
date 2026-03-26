import { APP_ROUTES, SETTINGS_ROUTES } from "@/app/routes";
import { router, Stack, usePathname } from "expo-router";
import { Appbar, useTheme } from "react-native-paper";

export default function SettingsLayout() {
  const theme = useTheme();
  const pathname = usePathname();

  const removeRouteGroups = (path: string) => path.replace(/\/\([^/]+\)/g, "");

  const normalizedPathname = removeRouteGroups(pathname);

  const topLevelSettingsRoutes = new Set<string>([
    removeRouteGroups(SETTINGS_ROUTES.MANAGE_PROFILE),
    removeRouteGroups(SETTINGS_ROUTES.PASSWORD_AND_SECURITY),
    removeRouteGroups(SETTINGS_ROUTES.THEME),
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
                if (!isTopLevelSettingsRoute) {
                  router.back();
                  console.log("back");
                  return;
                }

                console.log("replace");
                router.replace(APP_ROUTES.SETTINGS);
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
        name="preferences/theme"
        options={{
          title: "Theme",
        }}
      />
    </Stack>
  );
}
