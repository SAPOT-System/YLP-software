import { useContainer } from "./use-container";

export function useConnectionService() {
  return useContainer().connectionService;
}
