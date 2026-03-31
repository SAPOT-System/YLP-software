import { useMainContainer } from "@/features/shared/hooks";

export function useCallService() {
  return useMainContainer().callService;
}
