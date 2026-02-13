import { useContainer } from "./use-container";

export function usePeerService() {
  return useContainer().peerService;
}