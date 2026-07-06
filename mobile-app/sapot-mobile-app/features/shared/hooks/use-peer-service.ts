import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-peer-service] module loaded");

export function usePeerService() {
  return useAuthContainer().peerService;
}
