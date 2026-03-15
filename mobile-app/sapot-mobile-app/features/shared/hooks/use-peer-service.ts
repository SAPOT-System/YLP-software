import { useAuthContainer } from "@/features/auth";

export function usePeerService() {
  return useAuthContainer().peerService;
}
