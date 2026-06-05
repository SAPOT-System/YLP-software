import { hookLog } from "../utils/logger";
import { useUserStore } from "./use-user-store";
import { Peer } from "../database/model/Peer";
import { GuestUser } from "../database/model/guest-user";
hookLog.debug("[use-user-profile] module loaded");

export function useUserProfile() {
  const userStore = useUserStore();
  hookLog.debug("[useUserProfile] accessed", { isGuest: userStore.isGuest });
  let user: Peer | GuestUser | null = null;
  try {
    user = userStore.user;
  } catch {
    user = null;
  }
  return { user, isGuest: userStore.isGuest };
}
