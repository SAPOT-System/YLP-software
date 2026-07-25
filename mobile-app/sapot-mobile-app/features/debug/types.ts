export type DebugSectionKey =
  | "auth"
  | "users"
  | "database"
  | "messaging"
  | "peers"
  | "webrtc"
  | "gps"
  | "announcements"
  | "offline"
  | "network"
  | "sync"
  | "feature-flags"
  | "notifications"
  | "errors"
  | "performance"
  | "logs";

export interface DebugSectionMeta {
  key: DebugSectionKey;
  label: string;
  icon: string;
}

export const DEBUG_SECTIONS: DebugSectionMeta[] = [
  { key: "auth", label: "Auth", icon: "account-key" },
  { key: "users", label: "Users", icon: "account-group" },
  { key: "database", label: "Database", icon: "database" },
  { key: "messaging", label: "Messaging", icon: "message-text" },
  { key: "peers", label: "Peers", icon: "lan" },
  { key: "webrtc", label: "WebRTC", icon: "phone-in-talk" },
  { key: "gps", label: "GPS", icon: "map-marker" },
  { key: "announcements", label: "Announcements", icon: "bullhorn" },
  { key: "offline", label: "Offline", icon: "cloud-off-outline" },
  { key: "network", label: "Network", icon: "wifi" },
  { key: "sync", label: "Sync", icon: "sync" },
  { key: "feature-flags", label: "Feature Flags", icon: "flag-outline" },
  { key: "notifications", label: "Notifications", icon: "bell-outline" },
  { key: "errors", label: "Errors", icon: "alert-circle-outline" },
  { key: "performance", label: "Performance", icon: "speedometer" },
  { key: "logs", label: "Logs", icon: "text-box-outline" },
];
