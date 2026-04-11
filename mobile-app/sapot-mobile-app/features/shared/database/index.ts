import baseLogger from "@/features/shared/utils/logger";

const dbLog = baseLogger.extend("database");
dbLog.debug("[shared/database] module loaded");

export * from "./database";
export * from "./model";

