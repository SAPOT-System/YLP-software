import baseLogger from "@/features/shared/utils/logger";

const callLog = baseLogger.extend("call");
callLog.debug("[call/services] module loaded");

export * from "./call-service";
