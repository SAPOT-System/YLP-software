import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-user-store] module loaded");

export const useUserStore = () => {
  return useAuthContainer().userStore;
};
