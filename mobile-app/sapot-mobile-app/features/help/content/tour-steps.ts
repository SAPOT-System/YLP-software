import type { TourStep } from "../types";

export const TOUR_STEPS: readonly TourStep[] = [
  { anchorId: "mode-badge", title: "Your connection mode", body: "This badge shows whether SAPOT is using the internet or a local network." },
  { anchorId: "chats-tab", title: "Conversations live here", body: "Use Chats for every message you send or receive." },
  { anchorId: "scan-qr-tab", title: "Add someone nearby", body: "Scan another person's QR code to connect directly." },
  { anchorId: "map-tab", title: "See people on the map", body: "The map shows nearby responders and shared locations.", audience: { rescuerOnly: true } },
  { anchorId: "announcements-drawer-item", title: "Announcements", body: "Official updates from the server appear here.", audience: { modes: ["server", "auto"] } },
  { anchorId: "settings-tab", title: "Help whenever you need it", body: "Open Help Center in Settings to read the complete guide." },
];
