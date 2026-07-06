import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Divider, IconButton, Text, TextInput, useTheme } from "react-native-paper";
import { useFaultInjector } from "../hooks/use-fault-injector";
import { NetworkFaultConfig, NetworkTransport } from "../services/fault-injector";

interface NetworkSectionProps {
  onBack: () => void;
}

const FIELDS: { key: keyof NetworkFaultConfig; label: string }[] = [
  { key: "latencyMs", label: "Latency (ms)" },
  { key: "lossRate", label: "Loss rate (0–1)" },
  { key: "dupRate", label: "Dup rate (0–1)" },
  { key: "corruptRate", label: "Corrupt rate (0–1)" },
];

const TRANSPORTS: { transport: NetworkTransport; label: string }[] = [
  { transport: "tcp", label: "TCP (LAN / peer-to-peer)" },
  { transport: "ws", label: "WebSocket (server relay)" },
];

export function NetworkSection({ onBack }: NetworkSectionProps) {
  const theme = useTheme();
  const { networkFaults, setNetworkFaults, resetNetworkFaults } = useFaultInjector();

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={onBack} />
        <Text variant="titleMedium">Network</Text>
      </View>

      <Divider />

      <ScrollView>
        {TRANSPORTS.map(({ transport, label }) => (
          <View key={transport} style={styles.section}>
            <Text
              variant="labelLarge"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {label}
            </Text>

            {FIELDS.map(({ key, label: fieldLabel }) => (
              <TextInput
                key={key}
                testID={`${transport}-${key}`}
                label={fieldLabel}
                keyboardType="numeric"
                value={String(networkFaults[transport][key])}
                onChangeText={(text) =>
                  setNetworkFaults(transport, { [key]: Number(text) || 0 })
                }
              />
            ))}

            <Button
              testID={`reset-${transport}`}
              mode="outlined"
              compact
              onPress={() => resetNetworkFaults(transport)}
            >
              Reset {transport.toUpperCase()} faults
            </Button>
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
  section: {
    padding: 12,
    gap: 8,
  },
});
