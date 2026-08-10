import type { HelpArticle } from "../../types";

export const chat: HelpArticle = {
  title: "Chat",
  summary: "Start conversations, add peers, and understand message delivery.",
  icon: "message-text",
  category: "communicating",
  blocks: [
    { type: "paragraph", text: "Chats keep your conversations with people you have connected with." },
    { type: "steps", items: ["Open Chats.", "Choose a person, or scan their QR code to connect.", "Write a message and tap send."] },
    { type: "callout", tone: "info", text: "On a local network, SAPOT can exchange messages without internet access." },
    { type: "action", label: "Open Chats", route: { pathname: "/(drawer)/(tabs)" } },
  ],
};
