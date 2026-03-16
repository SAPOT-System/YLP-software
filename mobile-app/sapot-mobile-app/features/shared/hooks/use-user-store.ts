import { useAuthContainer } from "@/features/auth";

export const useUserStore = () => {
  return useAuthContainer().userStore;
};
