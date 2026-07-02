import { useAuthContainer } from "@/features/auth";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-peer-service] module loaded");

export function usePeerService() {
  return useAuthContainer().peerService;
}
