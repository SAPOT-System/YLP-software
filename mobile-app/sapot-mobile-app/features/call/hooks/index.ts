import baseLogger from "@/features/shared/utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[call/hooks] module loaded");

export * from "./use-call-service"
export * from "./use-call"