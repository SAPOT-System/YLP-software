import { View } from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { DEBUG_SECTIONS, DebugSectionKey } from "../types";

interface DebugSectionPlaceholderProps {
  section: DebugSectionKey;
  onBack: () => void;
}

export function DebugSectionPlaceholder({
  section,
  onBack,
}: DebugSectionPlaceholderProps) {
  const theme = useTheme();
  const meta = DEBUG_SECTIONS.find((entry) => entry.key === section);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
        }}
      >
        <IconButton icon="arrow-left" onPress={onBack} />
        <Text variant="titleMedium">{meta?.label ?? section}</Text>
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          Coming soon.
        </Text>
      </View>
    </View>
  );
}
