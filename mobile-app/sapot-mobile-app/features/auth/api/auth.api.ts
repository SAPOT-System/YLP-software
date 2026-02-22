import { AxiosResponse } from "axios";
import { apiClient } from "@/features/shared";
import { RegisterApiRequest, RegisterResponse } from "../types";

export const register = async (
  credentials: RegisterApiRequest
): Promise<AxiosResponse<RegisterResponse>> => {
  const res = await apiClient.post<RegisterResponse>("/auth/", credentials);
  return res;
};
