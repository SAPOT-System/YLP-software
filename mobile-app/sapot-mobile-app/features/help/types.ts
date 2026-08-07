import type { ImageSourcePropType } from "react-native";
import type { AppMode } from "@/features/shared/core/stores/app-mode-store";

export type AnchorId =
  | "mode-badge"
  | "chats-tab"
  | "scan-qr-tab"
  | "map-tab"
  | "peer-profile-call-buttons"
  | "announcements-drawer-item"
  | "settings-tab";

export type HelpAudience = {
  modes?: readonly AppMode[];
  guest?: "only" | "exclude";
  rescuerOnly?: true;
};

export type HelpContext = {
  mode: AppMode;
  isGuest: boolean;
  isRescuer: boolean;
};

export type HelpRoute = { pathname: string; params?: Record<string, string> };

export type HelpBlock =
  | { type: "paragraph"; text: string; audience?: HelpAudience }
  | { type: "steps"; items: readonly string[]; audience?: HelpAudience }
  | { type: "bullets"; items: readonly string[]; audience?: HelpAudience }
  | { type: "callout"; tone: "info" | "warning"; text: string; audience?: HelpAudience }
  | { type: "image"; source: ImageSourcePropType; alt: string; audience?: HelpAudience }
  | { type: "action"; label: string; route: HelpRoute; audience?: HelpAudience };

export type HelpCategory = "getting-connected" | "communicating" | "account" | "problems";

export type HelpArticle = {
  title: string;
  summary: string;
  icon: string;
  category: HelpCategory;
  audience?: HelpAudience;
  blocks: readonly HelpBlock[];
};

export type TourStep = {
  anchorId: AnchorId;
  title: string;
  body: string;
  audience?: HelpAudience;
};
