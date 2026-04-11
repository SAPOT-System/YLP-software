import baseLogger from "../utils/logger";
import { useUserStore } from "./use-user-store";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-user-profile] module loaded");

export function useUserProfile() {
  const userStore = useUserStore();
  hookLog.debug("[useUserProfile] accessed", { isGuest: userStore.isGuest });
  return { user: userStore.user, isGuest: userStore.isGuest };
}
