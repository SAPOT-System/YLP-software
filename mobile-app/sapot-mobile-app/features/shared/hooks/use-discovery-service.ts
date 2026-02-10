import { useContainer } from "./use-container";

export function useDiscoveryService() {
  return useContainer().discoveryService;
}
