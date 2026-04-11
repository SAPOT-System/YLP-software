import baseLogger from "@/features/shared/utils/logger";

const chatLog = baseLogger.extend("chat");
chatLog.debug("[chat/services] module loaded");

export { ChatService } from "./chat-service";