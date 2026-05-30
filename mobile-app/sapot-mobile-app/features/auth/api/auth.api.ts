import { apiClient } from "@/features/shared";
import { apiLog } from "@/features/shared/utils/logger";
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
  apiLog.info("[AuthApi] Calling /auth/", {
    hasUsername: Boolean(credentials.username?.trim()),
    hasFirstName: Boolean(credentials.first_name?.trim()),
    hasLastName: Boolean(credentials.last_name?.trim()),
    hasEmail: Boolean(credentials.email?.trim()),
    hasPhoneNumber: Boolean(credentials.phone_number?.trim()),
    password: "[REDACTED]",
  });
  const res = await apiClient.post<RegisterApiResponse>("/auth/", credentials);
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const loginApi = async (
  credentials: LoginApiRequest
): Promise<AxiosResponse<LoginApiResponse>> => {
  apiLog.info("[AuthApi] Calling /auth/token", {
    hasUsername: Boolean(credentials.username?.trim()),
    password: "[REDACTED]",
  });
  const formData = `grant_type=password&username=${encodeURIComponent(
    credentials.username
  )}&password=${encodeURIComponent(
    credentials.password
  )}&scope=&client_id=&client_secret=`;

  const res = await apiClient.post("/auth/token", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const logoutApi = async () => {
  apiLog.info("[AuthApi] Calling /auth/logout");
  const res = await apiClient.post("/auth/logout");
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const refreshTokenApi = async (refreshToken: string) => {
  apiLog.info("[AuthApi] Calling /auth/refresh", {
    hasRefreshToken: Boolean(refreshToken),
  });
  const res = await apiClient.post<{
    refresh_token: string;
    access_token: string;
  }>("/auth/refresh", { refresh_token: refreshToken });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const existsApi = async (identifier: string) => {
  apiLog.info("[AuthApi] Calling /auth/exists/", {
    identifierLength: identifier.length,
  });
  const res = await apiClient.get<{ exists: boolean }>("/auth/exists/", {
    params: { identifier },
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const addSecurityQuestionApi = async (
  questions: { question: string; answer: string }[],
  token: string
) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/security-questions", {
    questionsCount: questions.length,
    hasToken: Boolean(token),
  });
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
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const generateNewRecoveryKeyApi = async (token: string) => {
  apiLog.info(
    "[AuthApi] Calling /auth/forgot-password/generate-new-recovery-key",
    { hasToken: Boolean(token) }
  );
  const res = await apiClient.post<string>(
    "/auth/forgot-password/generate-new-recovery-key",
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
        Accept: "text/plain",
      },
    }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const getSecurityQuestionApi = async (identifier: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/security-question", {
    identifierLength: identifier.length,
  });
  const res = await apiClient.get<{ question: string }>(
    "/auth/forgot-password/security-question",
    { params: { identifier } }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const verifySecurityQuestionApi = async (
  identifier: string,
  requestBody: { question: string; answer: string }
) => {
  apiLog.info(
    "[AuthApi] Calling /auth/forgot-password/security-question/answer",
    { identifierLength: identifier.length }
  );
  const res = await apiClient.post<{ correct: boolean; reset_link: string }>(
    "/auth/forgot-password/security-question/answer",
    requestBody,
    { params: { identifier } }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const canResetPasswordApi = async (token: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/reset-password", {
    hasToken: Boolean(token),
  });
  const res = await apiClient.get("/auth/forgot-password/reset-password", {
    params: { token },
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.status === 200;
};

export const resetPasswordApi = async (token: string, newPassword: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/reset-password", {
    hasToken: Boolean(token),
    password: "[REDACTED]",
  });
  const res = await apiClient.post<{ message: string }>(
    "/auth/forgot-password/reset-password",
    { new_password: newPassword },
    { params: { token } }
  );

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const changePasswordApi = async (
  currentPassword: string,
  newPassword: string
) => {
  apiLog.info("[AuthApi] Calling /auth/change-password", {
    currentPassword: "[REDACTED]",
    newPassword: "[REDACTED]",
  });
  const res = await apiClient.post("/auth/change-password", null, {
    params: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
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
  const formData = new FormData();
  apiLog.debug("auth › verify recovery key", {
    hasIdentifier: Boolean(identifier),
  });
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
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const sendResetEmailCodeApi = async (email: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/email", {
    emailLength: email.length,
  });
  const res = await apiClient.post("/auth/forgot-password/email", null, {
    params: {
      email: email,
    },
    headers: {
      Accept: "application/json",
    },
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const verifyResetEmailCodeApi = async (email: string, code: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/email-code", {
    emailLength: email.length,
    codeLength: code.length,
  });
  const res = await apiClient.post<{ link: string; detail: string }>(
    "/auth/forgot-password/email-code",
    null,
    {
      params: {
        email,
        code,
      },
    }
  );

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const resendVerificationCodeEmail = async (email?: string) => {
  apiLog.info("[AuthApi] Calling /auth/verify/resend-verification-code");
  const res = await apiClient.post<{ message: string }>(
    "/auth/verify/resend-verification-code",
    null,
    email ? { params: { email } } : undefined
  );

  apiLog.info("[AuthApi] Response received");
  return res.data;
};

export const verifyCodeEmail = async (code: string) => {
  apiLog.info("[AuthApi] Calling /auth/verify/verify-code", {
    codeLength: code.length,
  });
  const res = await apiClient.post("/auth/verify/verify-code", { code });

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const checkGsmHealth = async (): Promise<boolean> => {
  try {
    apiLog.info("[AuthApi] Calling /gsm/health");
    const res = await apiClient.get<{ status: string }>("/gsm/health");
    apiLog.info("[AuthApi] GSM health response", { status: res.status });
    return res.status === 200;
  } catch (error) {
    apiLog.warn("[AuthApi] GSM health check failed", { error });
    return false;
  }
};

export const requestPhoneVerification = async (phoneNumber?: string) => {
  apiLog.info("[AuthApi] Calling /gsm/request", { hasPhoneNumber: Boolean(phoneNumber) });
  const res = await apiClient.post<{ message: string }>("/gsm/request", {
    phone_number: phoneNumber,
  });

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const verifyCodePhone = async (code: string) => {
  apiLog.info("[AuthApi] Calling /gsm/verify", { codeLength: code.length });
  const res = await apiClient.post("/gsm/verify", { code });

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const sendResetSmsCodeApi = async (phone: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/phone", {
    phoneLength: phone.length,
  });
  const res = await apiClient.post("/auth/forgot-password/phone", {
    phone_number: phone,
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const verifyResetSmsCodeApi = async (phone: string, code: string) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/phone-code", {
    phoneLength: phone.length,
    codeLength: code.length,
  });
  const res = await apiClient.post<{ link: string; detail: string }>(
    "/auth/forgot-password/phone-code",
    { phone_number: phone, code }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const fetchTermsContent = async (): Promise<string> => {
  apiLog.info("[AuthApi] Calling /auth/terms");
  const res = await apiClient.get<{ content: string }>("/auth/terms");
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data.content;
};

export const resendVerificationCodePhone = async () => {
  apiLog.info("[AuthApi] Calling /gsm/resend");
  const res = await apiClient.post<{ message: string }>("/gsm/resend");

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};
