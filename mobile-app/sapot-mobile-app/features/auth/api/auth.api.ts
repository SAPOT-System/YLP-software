import { apiClient } from "@/features/shared";
import { AxiosResponse } from "axios";
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
  const res = await apiClient.get<{ exists: boolean }>("/auth/exists/", {
    params: { identifier },
  });
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

export const getSecurityQuestionApi = async (identifier: string) => {
  const res = await apiClient.get<{ question: string }>(
    "/auth/forgot-password/security-question",
    { params: { identifier } }
  );
  return res;
};

export const verifySecurityQuestionApi = async (
  identifier: string,
  requestBody: { question: string; answer: string }
) => {
  const res = await apiClient.post<{ correct: boolean; reset_link: string }>(
    "/auth/forgot-password/security-question/answer",
    requestBody,
    { params: { identifier } }
  );
  return res;
};

export const canResetPasswordApi = async (token: string) => {
  const res = await apiClient.get("/auth/forgot-password/reset-password", {
    params: { token },
  });
  return res.status === 200;
};

export const resetPasswordApi = async (token: string, newPassword: string) => {
  const res = await apiClient.post<{ message: string }>(
    "/auth/forgot-password/reset-password",
    { new_password: newPassword },
    { params: { token } }
  );

  return res;
};

export type ExpoFileUpload = {
  uri: string;
  name: string;
  type: string;
};

export const verifyRecoveryKeyApi = async (
  file: ExpoFileUpload,
  identifier: string
) => {
  // eslint-disable-next-line no-undef
  const formData = new FormData();
  console.log(identifier);
  formData.append("key_file", {
    uri: file.uri,
    name: file.name,
    type: file.type,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const res = await apiClient.post<{
    "recovery-link": string;
    method: string;
    expire_in_seconds: number;
  }>("/auth/forgot-password/recovery-with-recovery-key", formData, {
    params: { user_identifier: identifier },
    headers: {
      "Content-Type": "multipart/form-data",
      Accept: "application/json",
    },
  });
  return res;
};
