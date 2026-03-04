import { AxiosResponse } from "axios";
import { apiClient } from "@/features/shared";
import {
  LoginApiRequest,
  LoginApiResponse,
  RegisterApiRequest,
  RegisterApiResponse,
} from "../types";

export const register = async (
  credentials: RegisterApiRequest
): Promise<AxiosResponse<RegisterApiResponse>> => {
  const res = await apiClient.post<RegisterApiResponse>("/auth/", credentials);
  return res;
};

export const loginApi = async (
  credentials: LoginApiRequest
): Promise<AxiosResponse<LoginApiResponse>> => {

  const formData = `grant_type=password&username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&scope=&client_id=&client_secret=`;

  const res = await apiClient.post("/auth/token", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res;
};
