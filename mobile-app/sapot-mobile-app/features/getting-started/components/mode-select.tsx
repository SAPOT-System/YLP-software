import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

export interface ModeSelectProps {
  mode: "server" | "lan";
  selected?: boolean;
  onPress?: () => void;
}

const descriptionList = {
  server: [
    { id: 1, description: "Use the app over the internet" },
    { id: 2, description: "Sign in with an account" },
    { id: 3, description: "Sync your data and receive push notifications" },
  ],
  lan: [
    { id: 1, description: "Use the app on your local network" },
    { id: 2, description: "No sign-in needed" },
    { id: 3, description: "Connect with nearby devices" },
  ],
};

export const ModeSelect = ({
  mode,
  selected = false,
  onPress,
}: ModeSelectProps) => {
  const theme = useTheme();
  return (
    <Pressable
      style={{
        flex: 1,
        flexWrap: "wrap",
        borderRadius: 10,
        borderColor: selected
          ? theme.colors.primary
          : theme.colors.onPrimaryContainer,
        borderWidth: selected ? 1 : 1,
        backgroundColor: selected
          ? theme.colors.primaryContainer
          : "transparent",
        padding: 20,
      }}
      onPress={onPress}
    >
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon
            source={mode === "server" ? "cloud" : "network-strength-3"}
            color={theme.colors.inverseOnSurface}
            size={20}
          />
          <Text
            variant="titleSmall"
            style={{ color: theme.colors.inverseOnSurface }}
          >
            {mode === "server" ? "Server Mode" : "LAN Mode"}
          </Text>
        </View>
        <FlatList
          data={descriptionList[mode]}
          renderItem={({ item }) => (
            <Text
              key={item.id}
              style={{ marginBottom: 4, color: theme.colors.inverseOnSurface }}
              variant="bodySmall"
            >
              • {item.description}
            </Text>
          )}
        />
      </View>
    </Pressable>
  );
};
