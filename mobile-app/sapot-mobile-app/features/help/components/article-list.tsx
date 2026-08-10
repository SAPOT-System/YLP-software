import { SETTINGS_ROUTES } from "@/config/routes";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import { useHelpArticles } from "../hooks/use-help-articles";

interface ArticleListProps { onReplayTour: () => void }
export function ArticleList({ onReplayTour }: ArticleListProps) {
  const theme = useTheme(); const router = useRouter(); const articles = useHelpArticles();
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.secondary }} contentContainerStyle={{ padding: 16 }}><Pressable accessibilityRole="button" onPress={onReplayTour} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: 16, borderRadius: 8, backgroundColor: theme.colors.primaryContainer }}><Icon source="compass-outline" size={24} color={theme.colors.onPrimaryContainer} /><Text style={{ flex: 1, color: theme.colors.onPrimaryContainer }}>Take the tour again</Text></Pressable><View style={{ backgroundColor: theme.colors.background, borderRadius: 8 }}>{articles.map(({ id, article }) => <Pressable accessibilityRole="button" key={id} onPress={() => router.push({ pathname: SETTINGS_ROUTES.HELP_ARTICLE, params: { id } })} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}><Icon source={article.icon} size={24} color={theme.colors.onSurface} /><View style={{ flex: 1 }}><Text style={{ color: theme.colors.onSurface }}>{article.title}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{article.summary}</Text></View><Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} /></Pressable>)}</View></ScrollView>;
}
