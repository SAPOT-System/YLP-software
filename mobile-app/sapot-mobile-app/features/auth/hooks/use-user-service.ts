import { authLog } from "@/features/shared/core/utils/logger";
import { useAuthContainer } from "./use-auth-container";

export function useUserService() {
  const service = useAuthContainer().userService;
  authLog.debug("[useUserService] resolved");
  return service;
}
