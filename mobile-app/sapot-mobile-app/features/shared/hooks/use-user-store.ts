import { useAuthContainer } from "@/features/auth";
import baseLogger from "../utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-user-store] module loaded");

export const useUserStore = () => {
  return useAuthContainer().userStore;
};
