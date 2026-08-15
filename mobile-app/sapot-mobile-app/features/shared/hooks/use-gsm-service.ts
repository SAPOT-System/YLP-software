import { useMainContainer } from "./use-main-container";

export function useGsmService() {
  return useMainContainer().gsmService;
}
