import { useSyncExternalStore } from "react";
import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-user-store] module loaded");

export const useUserStore = () => {
  const { userStore } = useAuthContainer();

  return useSyncExternalStore(
    (listener) => userStore.subscribe(listener),
    () => userStore
  );
};
