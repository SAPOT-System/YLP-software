import type { HelpArticle } from "../../types";

export const accountAndRecovery: HelpArticle = {
  title: "Account & recovery",
  summary: "Manage your profile, password, and recovery methods.",
  icon: "shield-account",
  category: "account",
  audience: { guest: "exclude" },
  blocks: [
    { type: "paragraph", text: "Your account keeps your identity and recovery settings available when you use SAPOT in Server mode." },
    { type: "bullets", items: ["Keep your recovery key in a safe place.", "Use Settings to update your profile and security details."] },
    { type: "callout", tone: "warning", text: "Never share your password or recovery key with another person." },
  ],
};
