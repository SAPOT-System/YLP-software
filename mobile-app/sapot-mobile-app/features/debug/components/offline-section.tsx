import { ScrollView, StyleSheet, View } from "react-native";
import { Divider, IconButton, Switch, Text, useTheme } from "react-native-paper";
import { useFaultInjector } from "../hooks/use-fault-injector";
import { OfflineFlag } from "../services/fault-injector";

interface OfflineSectionProps {
  onBack: () => void;
}

interface OfflineToggleMeta {
  flag: OfflineFlag;
  label: string;
  description: string;
}

const OFFLINE_TOGGLES: OfflineToggleMeta[] = [
  {
    flag: "noInternet",
    label: "No internet",
    description: "Drops all outbound/inbound traffic on every transport",
  },
  {
    flag: "lanDown",
    label: "LAN down",
    description: "Drops TCP (peer-to-peer) traffic only",
  },
  {
    flag: "serverDown",
    label: "Server down",
    description: "Drops WebSocket (server-relay) traffic only",
  },
  {
    flag: "redisDown",
    label: "Redis down",
    description: "Symptom-only — no real traffic is blocked",
  },
  {
    flag: "authDown",
    label: "Auth down",
    description: "Symptom-only — no real traffic is blocked",
  },
  {
    flag: "syncDown",
    label: "Sync down",
    description: "Skips the next background sync",
  },
];

export function OfflineSection({ onBack }: OfflineSectionProps) {
  const theme = useTheme();
  const { offlineFlags, setOfflineFlag } = useFaultInjector();

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={onBack} />
        <Text variant="titleMedium">Offline</Text>
      </View>

      <Divider />

      <ScrollView>
        {OFFLINE_TOGGLES.map(({ flag, label, description }) => (
          <View key={flag} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text>{label}</Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {description}
              </Text>
            </View>
            <Switch
              testID={`toggle-${flag}`}
              value={offlineFlags[flag]}
              onValueChange={(value) => setOfflineFlag(flag, value)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 8,
  },
});
