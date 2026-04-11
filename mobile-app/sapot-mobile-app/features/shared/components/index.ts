import baseLogger from "@/features/shared/utils/logger";

const uiLog = baseLogger.extend("ui");
uiLog.debug("[shared/components] module loaded");

export * from "./failed-dialog";
export { default as LoadingOverlay } from "./loading-overlay";
export { default as PeerList } from "./peer-list";

