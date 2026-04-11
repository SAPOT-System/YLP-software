import baseLogger from "@/features/shared/utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[chat/hooks] module loaded");

export { default as useChats } from "./use-chats";
export * from "./use-chat-service"