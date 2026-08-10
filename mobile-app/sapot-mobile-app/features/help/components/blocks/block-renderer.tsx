import { useRouter } from "expo-router";
import { Image, View } from "react-native";
import { Button, Icon, Text, useTheme } from "react-native-paper";
import type { HelpBlock } from "../../types";

interface BlockRendererProps { block: HelpBlock }

export function BlockRenderer({ block }: BlockRendererProps) {
  const theme = useTheme();
  const router = useRouter();
  switch (block.type) {
    case "paragraph": return <Text variant="bodyMedium" style={{ marginBottom: 12, color: theme.colors.onSurface }}>{block.text}</Text>;
    case "steps": return <View style={{ marginBottom: 12, gap: 8 }}>{block.items.map((item, index) => <View key={item} style={{ flexDirection: "row", gap: 8 }}><Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: "700" }}>{`${index + 1}.`}</Text><Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurface }}>{item}</Text></View>)}</View>;
    case "bullets": return <View style={{ marginBottom: 12, gap: 6 }}>{block.items.map((item) => <Text key={item} variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{`•  ${item}`}</Text>)}</View>;
    case "callout": {
      const warning = block.tone === "warning";
      const backgroundColor = warning ? theme.colors.errorContainer : theme.colors.secondaryContainer;
      const color = warning ? theme.colors.onErrorContainer : theme.colors.onSecondaryContainer;
      return <View style={{ flexDirection: "row", gap: 8, padding: 12, marginBottom: 12, borderRadius: 8, backgroundColor }}><Icon source={warning ? "alert-outline" : "information-outline"} size={20} color={color} /><Text variant="bodySmall" style={{ flex: 1, color }}>{block.text}</Text></View>;
    }
    case "image": return <Image source={block.source} accessibilityLabel={block.alt} resizeMode="contain" style={{ width: "100%", height: 180, marginBottom: 12, borderRadius: 8 }} />;
    case "action": return <Button mode="contained-tonal" style={{ marginBottom: 12 }} onPress={() => router.push(block.route)}>{block.label}</Button>;
  }
}
