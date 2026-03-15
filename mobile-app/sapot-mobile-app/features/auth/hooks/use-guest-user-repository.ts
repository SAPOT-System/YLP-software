import { useAuthContainer } from "./use-auth-container";

export function useGuestUserRepository() {
  return useAuthContainer().guestUserRepository;
}
