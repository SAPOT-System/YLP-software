import type { HelpArticle } from "../../types";

export const mapAndLocation: HelpArticle = {
  title: "Map & location",
  summary: "View nearby responders and shared locations.",
  icon: "map-marker-radius",
  category: "communicating",
  audience: { rescuerOnly: true },
  blocks: [
    { type: "paragraph", text: "The map shows the latest locations shared by people on the SAPOT network." },
    { type: "callout", tone: "warning", text: "Location sharing needs device location permission. You can change that permission in your device settings." },
    { type: "action", label: "Open Map", route: { pathname: "/(drawer)/(tabs)/map" } },
  ],
};
