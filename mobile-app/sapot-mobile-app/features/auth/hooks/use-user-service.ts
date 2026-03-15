import { useAuthContainer } from "./use-auth-container";

export function useUserService() {
  return useAuthContainer().userService;
}
