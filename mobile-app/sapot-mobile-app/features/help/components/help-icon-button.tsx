import { SETTINGS_ROUTES } from "@/config/routes";
import { useRouter } from "expo-router";
import { IconButton } from "react-native-paper";
import type { HelpArticleId } from "../content/registry";

interface HelpIconButtonProps { articleId: HelpArticleId; size?: number; color?: string }
export function HelpIconButton({ articleId, size = 22, color }: HelpIconButtonProps) {
  const router = useRouter();
  return <IconButton icon="help-circle-outline" size={size} iconColor={color} accessibilityLabel="Help" onPress={() => router.push({ pathname: SETTINGS_ROUTES.HELP_ARTICLE, params: { id: articleId } })} />;
}
