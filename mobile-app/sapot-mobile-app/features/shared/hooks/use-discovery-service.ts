import { useMainContainer } from "./use-main-container";

export function useDiscoveryService() {
  return useMainContainer().discoveryService;
}
