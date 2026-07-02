import { useServerStatus } from "@/features/shared/core/context";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-server-action] module loaded");

export function useServerAction() {
  const { shouldWarn } = useServerStatus();

  function guardAction<T>(
    action: () => Promise<T>,
    onBlocked?: () => void
  ): () => Promise<T | undefined> {
    return async () => {
      if (shouldWarn) {
        hookLog.warn("[useServerAction] blocked — server offline");
        onBlocked?.();
        return undefined;
      }
      return action();
    };
  }

  return { guardAction, isServerOffline: shouldWarn };
}
