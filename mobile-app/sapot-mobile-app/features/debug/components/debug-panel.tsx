import { IS_DEBUG_ENABLED } from "@/config/debug";
import { useAppMode, useServerStatus } from "@/features/shared/core/context";
import { useUserStore } from "@/features/shared/hooks";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Divider,
  IconButton,
  List,
  Modal,
  Portal,
  Text,
  useTheme,
} from "react-native-paper";
import { useDebugPanel } from "../hooks/use-debug-panel";
import { debugDbService } from "../services/debug-db-service";
import { DEBUG_SECTIONS, DebugSectionKey } from "../types";
import { AuthSection } from "./auth-section";
import { DatabaseSection } from "./database-section";
import { DebugSectionPlaceholder } from "./debug-section-placeholder";
import { NetworkSection } from "./network-section";
import { OfflineSection } from "./offline-section";

const QUICK_ACTIONS = [
  "Skip login",
  "Reset DB",
  "Force sync",
  "Toggle mode",
  "Clear logs",
] as const;

const QUICK_ACTION_HANDLERS: Partial<Record<(typeof QUICK_ACTIONS)[number], () => void>> = {
  "Reset DB": () => {
    debugDbService.resetDatabase();
  },
};

export function DebugPanel() {
  if (!IS_DEBUG_ENABLED) return null;

  return <DebugPanelContent />;
}

function DebugPanelContent() {
  const { isOpen, close } = useDebugPanel();
  const theme = useTheme();
  const { mode } = useAppMode();
  const { online } = useServerStatus();
  const userStore = useUserStore();
  const [selectedSection, setSelectedSection] =
    useState<DebugSectionKey | null>(null);

  const variant = __DEV__ ? "development" : (Updates.channel ?? "unknown");
  const version = Constants.expoConfig?.extra?.displayVersion ?? "unknown";
  const peerId = userStore.user?.id ?? "—";

  const handleDismiss = () => {
    setSelectedSection(null);
    close();
  };

  return (
    <Portal>
      <Modal
        visible={isOpen}
        onDismiss={handleDismiss}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium">Debug Panel</Text>
            <Text variant="bodySmall">
              {variant} • v{version} • {peerId}
            </Text>
            <Text variant="bodySmall">
              {mode.toUpperCase()} • {online ? "online" : "offline"}
            </Text>
          </View>
          <IconButton icon="close" onPress={handleDismiss} />
        </View>

        <Divider />

        {selectedSection ? (
          selectedSection === "database" ? (
            <DatabaseSection onBack={() => setSelectedSection(null)} />
          ) : selectedSection === "auth" || selectedSection === "users" ? (
            <AuthSection onBack={() => setSelectedSection(null)} />
          ) : selectedSection === "offline" ? (
            <OfflineSection onBack={() => setSelectedSection(null)} />
          ) : selectedSection === "network" ? (
            <NetworkSection onBack={() => setSelectedSection(null)} />
          ) : (
            <DebugSectionPlaceholder
              section={selectedSection}
              onBack={() => setSelectedSection(null)}
            />
          )
        ) : (
          <>
            <View style={styles.quickActions}>
              {QUICK_ACTIONS.map((action) => {
                const handler = QUICK_ACTION_HANDLERS[action];
                return (
                  <Button
                    key={action}
                    mode="outlined"
                    disabled={!handler}
                    onPress={handler}
                    compact
                  >
                    {action}
                  </Button>
                );
              })}
            </View>

            <Divider />

            <ScrollView>
              {DEBUG_SECTIONS.map((section) => (
                <List.Item
                  key={section.key}
                  title={section.label}
                  left={(props) => <List.Icon {...props} icon={section.icon} />}
                  onPress={() => setSelectedSection(section.key)}
                />
              ))}
            </ScrollView>
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    height: "80%",
    marginTop: "auto",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 8,
  },
});
