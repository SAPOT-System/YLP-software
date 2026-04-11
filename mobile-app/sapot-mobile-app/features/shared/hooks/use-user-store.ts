import { useAuthContainer } from "@/features/auth";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-user-store] module loaded");

export const useUserStore = () => {
  return useAuthContainer().userStore;
};
