import { authLog } from "@/features/shared/utils/logger";
import { useAuthContainer } from "./use-auth-container";

export function useGuestUserRepository() {
  const repository = useAuthContainer().guestUserRepository;
  authLog.debug("[useGuestUserRepository] resolved");
  return repository;
}
