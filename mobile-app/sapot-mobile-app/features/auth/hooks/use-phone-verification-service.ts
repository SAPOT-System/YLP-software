import { useAuthContainer } from "./use-auth-container";

export function usePhoneVerificationService() {
  return useAuthContainer().phoneVerificationService;
}
