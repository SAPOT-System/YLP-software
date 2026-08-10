import { SETTINGS_ROUTES } from "@/config/routes";
import { ArticleView, getArticle, isVisible, useHelpContext } from "@/features/help";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function HelpArticleScreen() {
  const theme = useTheme(); const router = useRouter(); const { id } = useLocalSearchParams<{ id?: string }>();
  const ctx = useHelpContext(); const article = getArticle(id ?? "");
  const unavailableMessage = !article ? "We couldn't find that topic." : !isVisible(article.audience, ctx) ? `This topic doesn't apply in ${ctx.mode.toUpperCase()} mode.` : null;
  if (unavailableMessage) return <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: "center", backgroundColor: theme.colors.secondary }}><Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{unavailableMessage}</Text><Button mode="contained" onPress={() => router.push(SETTINGS_ROUTES.HELP_CENTER)}>Back to Help Center</Button></View>;
  if (!article) return null;
  return <ArticleView article={article} ctx={ctx} />;
}
