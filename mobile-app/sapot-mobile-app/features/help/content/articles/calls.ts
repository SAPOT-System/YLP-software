import type { HelpArticle } from "../../types";

export const calls: HelpArticle = {
  title: "Calls",
  summary: "Place and answer audio and video calls with nearby people.",
  icon: "phone",
  category: "communicating",
  blocks: [
    { type: "paragraph", text: "Calls run directly between devices when possible, so they can keep working on a local network." },
    { type: "steps", items: ["Open Chats and select a person.", "Tap the audio or video call button on their profile.", "Wait for them to accept the call."] },
    { type: "callout", tone: "info", text: "SAPOT requests microphone and camera permission before your first call." },
    { type: "bullets", items: ["Choose earpiece, speaker, or Bluetooth from the call controls.", "Turning your camera off continues the call as audio only."] },
  ],
};
