import { getApiUrl, setRuntimeHostOverride } from "@/config/runtime";
import { apiClient } from "@/features/shared/api/client";
import {
  getServerHostOverride,
  saveServerHostOverride,
} from "@/features/shared/stores/secure-config";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import {
  Button,
  Icon,
  IconButton,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

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
  const [configVisible, setConfigVisible] = useState(false);
  const [host, setHost] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (mode !== "server") return;
    const defaultHost = getApiUrl().replace(/^https?:\/\//, "").split(":")[0];
    getServerHostOverride().then((stored) => {
      setHost(stored ?? defaultHost);
    });
  }, [mode]);

  const handleSave = async () => {
    const trimmed = host.trim() || null;
    setRuntimeHostOverride(trimmed);
    await saveServerHostOverride(trimmed);
    apiClient.defaults.baseURL = getApiUrl();
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setConfigVisible(false);
    }, 1000);
  };

  return (
    <>
      {mode === "server" && (
        <Portal>
          <Modal
            visible={configVisible}
            onDismiss={() => setConfigVisible(false)}
            contentContainerStyle={{
              margin: 24,
              borderRadius: 12,
              backgroundColor: theme.colors.surface,
              padding: 20,
            }}
          >
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>
              Server Host
            </Text>
            <TextInput
              mode="outlined"
              label="Host"
              placeholder="e.g. 192.168.1.50"
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              right={
                saved ? (
                  <TextInput.Icon icon="check" color={theme.colors.primary} />
                ) : undefined
              }
            />
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saved}
              style={{ marginTop: 16 }}
            >
              Save
            </Button>
          </Modal>
        </Portal>
      )}

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
              style={{ color: theme.colors.inverseOnSurface, flex: 1 }}
            >
              {mode === "server" ? "Server Mode" : "LAN Mode"}
            </Text>
            {mode === "server" && (
              <IconButton
                icon="cog"
                size={18}
                style={{ margin: 0 }}
                onPress={(e) => {
                  e.stopPropagation();
                  setConfigVisible(true);
                }}
              />
            )}
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
    </>
  );
};
