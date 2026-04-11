import baseLogger from "@/features/shared/utils/logger";

const apiLog = baseLogger.extend("api");
apiLog.debug("[sync/api] module loaded");

export * from "./sync.api";
