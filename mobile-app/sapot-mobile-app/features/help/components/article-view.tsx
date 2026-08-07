import { ScrollView, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { isVisible } from "../services/help-visibility";
import type { HelpArticle, HelpContext } from "../types";
import { BlockRenderer } from "./blocks/block-renderer";

interface ArticleViewProps { article: HelpArticle; ctx: HelpContext }

export function ArticleView({ article, ctx }: ArticleViewProps) {
  const theme = useTheme();
  const blocks = article.blocks.filter((block) => isVisible(block.audience, ctx));
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.secondary }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}><Text variant="headlineSmall" style={{ marginBottom: 4, color: theme.colors.onSurface }}>{article.title}</Text><Text variant="bodySmall" style={{ marginBottom: 20, color: theme.colors.onSurfaceVariant }}>{article.summary}</Text><View>{blocks.map((block, index) => <BlockRenderer key={`${block.type}-${index}`} block={block} />)}</View></ScrollView>;
}
