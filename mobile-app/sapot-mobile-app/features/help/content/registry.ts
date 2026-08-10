import type { HelpArticle } from "../types";
import { accountAndRecovery } from "./articles/account-and-recovery";
import { announcements } from "./articles/announcements";
import { calls } from "./articles/calls";
import { chat } from "./articles/chat";
import { connecting } from "./articles/connecting";
import { mapAndLocation } from "./articles/map-and-location";
import { troubleshooting } from "./articles/troubleshooting";

export const HELP_ARTICLES = {
  connecting, chat, calls, "map-and-location": mapAndLocation, announcements,
  "account-and-recovery": accountAndRecovery, troubleshooting,
} as const satisfies Record<string, HelpArticle>;

export type HelpArticleId = keyof typeof HELP_ARTICLES;
export const HELP_ARTICLE_IDS = Object.keys(HELP_ARTICLES) as HelpArticleId[];
export function getArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES[id as HelpArticleId];
}
