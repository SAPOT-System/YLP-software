import { hookLog } from "../utils/logger";
import { useUserStore } from "./use-user-store";
hookLog.debug("[use-user-profile] module loaded");

export function useUserProfile() {
  const userStore = useUserStore();
  hookLog.debug("[useUserProfile] accessed", { isGuest: userStore.isGuest });
  return { user: userStore.user, isGuest: userStore.isGuest };
}
