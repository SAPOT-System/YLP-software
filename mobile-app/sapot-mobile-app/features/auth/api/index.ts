import baseLogger from "@/features/shared/utils/logger";

const apiLog = baseLogger.extend("auth-api");
apiLog.debug("[auth api] module loaded");

export * from "./auth.api";
