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
  const formData = `grant_type=password&username=${encodeURIComponent(
    credentials.username
  )}&password=${encodeURIComponent(
    credentials.password
  )}&scope=&client_id=&client_secret=`;

  const res = await apiClient.post("/auth/token", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res;
};

export const existsApi = async (identifier: string) => {
  const res = await apiClient.get("/auth/exists/", { params: { identifier } });
  return res.data;
};

export const addSecurityQuestionApi = async (
  questions: { question: string; answer: string }[],
  token: string
) => {
  const res = await apiClient.post<{ message: string }>(
    "/auth/forgot-password/security-questions",
    { questions },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    } // Added headers because of the late response of the axios interceptors
  );
  return res;
};

export const generateNewRecoveryKeyApi = async () => {
  const res = await apiClient.post<string>(
    "/auth/forgot-password/generate-new-recovery-key/"
  );
  return res;
};
