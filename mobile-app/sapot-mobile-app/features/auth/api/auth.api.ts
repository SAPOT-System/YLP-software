import { apiClient } from "@/features/shared";
import { RegisterRequest } from "../types";

export const register = async (credentials: RegisterRequest) => {
  const res = await apiClient.post("/auth/", credentials);
  return res;
};
