import { useMainContainer } from "./use-main-container";

export function useSyncService() {
  return useMainContainer().syncService;
}
