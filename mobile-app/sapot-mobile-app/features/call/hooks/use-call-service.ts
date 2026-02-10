import { useContainer } from "@/features/shared/hooks";

export function useCallService() {
  return useContainer().callService;
}
