import { useUserStore } from "./use-user-store";

export function useUserProfile() {
  const userStore = useUserStore();
  return { user: userStore.user, isGuest: userStore.isGuest };
}
