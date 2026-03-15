import { useMainContainer } from "./use-main-container";

export function useConnectionService() {
  return useMainContainer().connectionService;
}
