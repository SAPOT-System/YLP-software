import { Stack } from "expo-router";
import { Appbar, useTheme } from "react-native-paper";

export default function Layout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{
          header: ({ options }) => (
            <Appbar.Header
              statusBarHeight={0}
              style={{ height: 80 }}
              mode="center-aligned"
            >
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
          title: "Settings",
        }}
      />
    </Stack>
  );
}
