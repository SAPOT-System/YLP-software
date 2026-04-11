import baseLogger from "@/features/shared/utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[shared/hooks] module loaded");

export * from "./use-check-connection";
export * from "./use-connection-service";
export { default as useDatabase } from "./use-database";
export * from "./use-dialog-visibility";
export * from "./use-discovery-service";
export * from "./use-loading-overlay";
export * from "./use-main-container";
export * from "./use-peer-service";
export { default as usePeers } from "./use-peers";
export * from "./use-profile-photo";
export * from "./use-toast";
export * from "./use-user-profile";
export * from "./use-user-search";
export * from "./use-user-store";

