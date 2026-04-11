import { useAuthContainer } from "@/features/auth";
import baseLogger from "../utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-peer-service] module loaded");

export function usePeerService() {
  return useAuthContainer().peerService;
}
