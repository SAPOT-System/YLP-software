import baseLogger from "@/features/shared/utils/logger";

const hooksLog = baseLogger.extend("auth-hooks");
hooksLog.debug("[auth hooks] module loaded");

export * from "./use-auth-container";
export * from "./use-change-password";
export * from "./use-email-reset";
export * from "./use-get-question";
export * from "./use-guest-user-repository";
export * from "./use-register";
export * from "./use-user-service";
export * from "./use-validate-identifier";
export * from "./use-verify-question";
export * from "./use-verify-recovery-key";

