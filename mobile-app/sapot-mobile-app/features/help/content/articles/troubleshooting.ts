import type { HelpArticle } from "../../types";

export const troubleshooting: HelpArticle = {
  title: "Troubleshooting",
  summary: "Quick checks when SAPOT cannot connect or a feature is unavailable.",
  icon: "wrench",
  category: "problems",
  blocks: [
    { type: "steps", items: ["Check that Wi-Fi is on and you are connected to the incident network.", "Confirm the mode badge matches the network you intend to use.", "Check device permissions for the feature you are using."] },
    { type: "callout", tone: "info", text: "If the server is unavailable, LAN conversations can still work with nearby peers." },
  ],
};
