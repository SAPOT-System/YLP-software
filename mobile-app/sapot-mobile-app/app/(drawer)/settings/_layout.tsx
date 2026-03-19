import { Stack } from "expo-router";
import { Appbar, useTheme } from "react-native-paper";

export default function SettingsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: ({ options, navigation }) => (
          <Appbar.Header statusBarHeight={0} style={{ height: 80 }}>
            <Appbar.BackAction onPress={navigation.goBack} />
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
        name="manage-profile"
        options={{
          title: "Manage Profile",
        }}
      />
    </Stack>
  );
}
