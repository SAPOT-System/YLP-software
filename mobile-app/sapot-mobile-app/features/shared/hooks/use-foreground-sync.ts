import { useEffect } from "react";
import { AppState } from "react-native";
import { useSyncService } from "./use-sync-service";

export function useForegroundSync() {
  const syncService = useSyncService();

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncService.syncNow();
      }
    });
    return () => sub.remove();
  }, [syncService]);
}
