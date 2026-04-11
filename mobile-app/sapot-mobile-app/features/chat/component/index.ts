import baseLogger from "@/features/shared/utils/logger";

const uiLog = baseLogger.extend("ui");
uiLog.debug("[chat/components] module loaded");

export { default as ChatList } from "./chat-list";
export { default as MessageList } from "./message-list";
