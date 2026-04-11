import baseLogger from "@/features/shared/utils/logger";

const repoLog = baseLogger.extend("repository");
repoLog.debug("[shared/repositories] module loaded");

export * from "./guest-user-repository";
export * from "./peer-repository";

