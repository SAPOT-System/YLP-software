import type { HelpArticle } from "../../types";

export const connecting: HelpArticle = {
  title: "Connecting & modes",
  summary: "Server mode, LAN mode, and what the badge in the header means.",
  icon: "access-point-network",
  category: "getting-connected",
  blocks: [
    { type: "paragraph", text: "SAPOT works through the internet in Server mode or directly across a local network in LAN mode." },
    { type: "paragraph", text: "Your account lets messages sync and lets you receive notifications while the app is closed.", audience: { modes: ["server", "auto"], guest: "exclude" } },
    { type: "paragraph", text: "In LAN mode, messages stay on this device and reach people on the same network.", audience: { modes: ["lan"] } },
    { type: "bullets", items: ["The badge at the top of the screen shows your current mode.", "You can change mode later in Settings."] },
  ],
};
