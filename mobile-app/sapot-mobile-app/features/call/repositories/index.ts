import baseLogger from "@/features/shared/utils/logger";

const callLog = baseLogger.extend("call");
callLog.debug("[call/repositories] module loaded");

export { CallParticipantRepository } from "./call-participant-repository";
export { CallRepository } from "./call-repository";

