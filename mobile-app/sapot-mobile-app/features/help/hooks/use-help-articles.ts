import { HELP_ARTICLES, HELP_ARTICLE_IDS, type HelpArticleId } from "../content/registry";
import { isVisible } from "../services/help-visibility";
import type { HelpArticle } from "../types";
import { useHelpContext } from "./use-help-context";

export type VisibleArticle = { id: HelpArticleId; article: HelpArticle };
export function useHelpArticles(): VisibleArticle[] {
  const ctx = useHelpContext();
  return HELP_ARTICLE_IDS.filter((id) => isVisible(HELP_ARTICLES[id].audience, ctx)).map((id) => ({ id, article: HELP_ARTICLES[id] }));
}
