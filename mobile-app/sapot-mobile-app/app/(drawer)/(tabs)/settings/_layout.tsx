import { Stack } from "expo-router";
import { Appbar, useTheme } from "react-native-paper";

export default function Layout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: ({ options, route }) => {
          const isIndex = route.name === "index";

          return (
            <Appbar.Header
              statusBarHeight={0}
              style={{ height: 80 }}
              mode={isIndex ? "center-aligned" : undefined}
            >
              <Appbar.Content
                titleStyle={{
                  fontWeight: "bold",
                  color: theme.dark ? "#E6ECF5" : "#000",
                  fontSize: 24,
                }}
                title={options.title ?? "Settings"}
              />
            </Appbar.Header>
          );
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Settings",
        }}
      />
    </Stack>
  );
}
