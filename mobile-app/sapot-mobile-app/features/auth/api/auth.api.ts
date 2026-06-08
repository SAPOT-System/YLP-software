import { toAppError } from "@/features/shared/errors";
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

export interface DeviceLoginFields {
  deviceFingerprint: string;
  devicePublicKey: string;
  deviceNonce: string;
  deviceNonceMac: string;
  deviceSignature: string;
}

export const fetchChallengeApi = async (
  deviceFingerprint: string
): Promise<{ nonce: string; mac: string }> => {
  const res = await apiClient.get<{ nonce: string; mac: string }>("/auth/challenge", {
    params: { device_fingerprint: deviceFingerprint },
  });
  return res.data;
};

export const loginApi = async (
  credentials: LoginApiRequest,
  deviceFields?: DeviceLoginFields
): Promise<AxiosResponse<LoginApiResponse>> => {
  apiLog.info("[AuthApi] Calling /auth/token", {
    hasUsername: Boolean(credentials.username?.trim()),
    hasDeviceFields: Boolean(deviceFields),
    password: "[REDACTED]",
  });

  let formData = `grant_type=password&username=${encodeURIComponent(
    credentials.username
  )}&password=${encodeURIComponent(
    credentials.password
  )}&scope=&client_id=&client_secret=`;

  if (deviceFields) {
    formData +=
      `&device_public_key=${encodeURIComponent(deviceFields.devicePublicKey)}` +
      `&device_nonce=${encodeURIComponent(deviceFields.deviceNonce)}` +
      `&device_nonce_mac=${encodeURIComponent(deviceFields.deviceNonceMac)}` +
      `&device_signature=${encodeURIComponent(deviceFields.deviceSignature)}` +
      `&device_fingerprint=${encodeURIComponent(deviceFields.deviceFingerprint)}`;
  }

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
  currentPassword?: string
) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/security-questions", {
    questionsCount: questions.length,
    hasCurrentPassword: Boolean(currentPassword),
  });
  const res = await apiClient.post<{ message: string }>(
    "/auth/forgot-password/security-questions",
    { questions },
    currentPassword
      ? { headers: { "X-Current-Password": currentPassword } }
      : undefined
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const generateNewRecoveryKeyApi = async (password?: string) => {
  apiLog.info(
    "[AuthApi] Calling /auth/forgot-password/generate-new-recovery-key"
  );
  const res = await apiClient.post<string>(
    "/auth/forgot-password/generate-new-recovery-key",
    null,
    {
      headers: {
        "Content-Type": "text/plain",
        Accept: "text/plain",
        ...(password ? { "X-Current-Password": password } : {}),
      },
    }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const getAvailableSecurityQuestionsApi = async () => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/generate-security-question");
  const res = await apiClient.get<string[]>(
    "/auth/forgot-password/generate-security-question"
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
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
  requestBody: { question: string; answer: string },
  deviceFields?: DeviceLoginFields
) => {
  apiLog.info(
    "[AuthApi] Calling /auth/forgot-password/security-question/answer",
    { identifierLength: identifier.length, hasDeviceFields: Boolean(deviceFields) }
  );
  const res = await apiClient.post<{
    correct: boolean;
    reset_link: string;
    recovery_token?: string;
    attempts_remaining?: number;
  }>(
    "/auth/forgot-password/security-question/answer",
    requestBody,
    { params: { identifier, ...deviceFields ? {
      device_public_key: deviceFields.devicePublicKey,
      device_nonce: deviceFields.deviceNonce,
      device_nonce_mac: deviceFields.deviceNonceMac,
      device_signature: deviceFields.deviceSignature,
      device_fingerprint: deviceFields.deviceFingerprint,
    } : {} } }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const canResetPasswordApi = async (
  token: string
): Promise<{ valid: boolean; userId: string | null }> => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/reset-password", {
    hasToken: Boolean(token),
  });
  try {
    const res = await apiClient.get<{ detail: string; user_id?: string }>(
      "/auth/forgot-password/reset-password",
      { params: { token } }
    );
    apiLog.info("[AuthApi] Response received", { status: res.status });
    return { valid: res.status === 200, userId: res.data.user_id ?? null };
  } catch (error) {
    const appErr = toAppError(error, "auth");
    apiLog.warn("[AuthApi] canResetPassword check failed", appErr);
    return { valid: false, userId: null };
  }
};

export const resetPasswordApi = async (
  token: string,
  newPassword: string,
  wrappedBlob?: string,
  recoveryToken?: string
) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/reset-password", {
    hasToken: Boolean(token),
    password: "[REDACTED]",
    hasWrappedBlob: Boolean(wrappedBlob),
    hasRecoveryToken: Boolean(recoveryToken),
  });
  const res = await apiClient.post<{ message: string }>(
    "/auth/forgot-password/reset-password",
    {
      new_password: newPassword,
      wrapped_blob: wrappedBlob ?? null,
      recovery_token: recoveryToken ?? null,
    },
    { params: { token } }
  );

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const reauthenticateApi = async (
  currentPassword: string
): Promise<{ reauth_token: string }> => {
  apiLog.info("[AuthApi] Calling /auth/reauthenticate", {
    password: "[REDACTED]",
  });
  const res = await apiClient.post<{ reauth_token: string }>(
    "/auth/reauthenticate",
    { current_password: currentPassword }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const changePasswordApi = async (
  currentPassword: string,
  newPassword: string
) => {
  apiLog.info("[AuthApi] Calling /auth/change-password", {
    currentPassword: "[REDACTED]",
    newPassword: "[REDACTED]",
  });
  const res = await apiClient.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
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
  identifier: string,
  deviceFields?: DeviceLoginFields
) => {
  const formData = new FormData();
  apiLog.debug("auth › verify recovery key", {
    hasIdentifier: Boolean(identifier),
    hasDeviceFields: Boolean(deviceFields),
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
    recovery_token: string;
  }>("/auth/forgot-password/recovery-with-recovery-key", formData, {
    params: { user_identifier: identifier, ...deviceFields ? {
      device_public_key: deviceFields.devicePublicKey,
      device_nonce: deviceFields.deviceNonce,
      device_nonce_mac: deviceFields.deviceNonceMac,
      device_signature: deviceFields.deviceSignature,
      device_fingerprint: deviceFields.deviceFingerprint,
    } : {} },
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

export const verifyResetEmailCodeApi = async (
  email: string,
  code: string,
  deviceFields?: DeviceLoginFields
) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/email-code", {
    emailLength: email.length,
    codeLength: code.length,
    hasDeviceFields: Boolean(deviceFields),
  });
  const res = await apiClient.post<{ link: string; detail: string; recovery_token: string }>(
    "/auth/forgot-password/email-code",
    null,
    {
      params: { email, code, ...deviceFields ? {
        device_public_key: deviceFields.devicePublicKey,
        device_nonce: deviceFields.deviceNonce,
        device_nonce_mac: deviceFields.deviceNonceMac,
        device_signature: deviceFields.deviceSignature,
        device_fingerprint: deviceFields.deviceFingerprint,
      } : {} },
    }
  );

  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const resendVerificationCodeEmail = async (
  email?: string,
  reauthToken?: string
) => {
  apiLog.info("[AuthApi] Calling /auth/verify/resend-verification-code");
  const headers = reauthToken ? { "X-Reauth-Token": reauthToken } : undefined;
  const config =
    email && headers
      ? { params: { email }, headers }
      : email
      ? { params: { email } }
      : headers
      ? { headers }
      : undefined;
  const res = await apiClient.post<{ message: string }>(
    "/auth/verify/resend-verification-code",
    null,
    config
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
    const appErr = toAppError(error, "auth");
    apiLog.warn("[AuthApi] GSM health check failed", appErr);
    return false;
  }
};

export const requestPhoneVerification = async (
  phoneNumber?: string,
  reauthToken?: string
) => {
  apiLog.info("[AuthApi] Calling /gsm/request", { hasPhoneNumber: Boolean(phoneNumber) });
  const res = await apiClient.post<{ message: string }>(
    "/gsm/request",
    { phone_number: phoneNumber },
    reauthToken ? { headers: { "X-Reauth-Token": reauthToken } } : undefined
  );

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

export const verifyResetSmsCodeApi = async (
  phone: string,
  code: string,
  deviceFields?: DeviceLoginFields
) => {
  apiLog.info("[AuthApi] Calling /auth/forgot-password/phone-code", {
    phoneLength: phone.length,
    codeLength: code.length,
    hasDeviceFields: Boolean(deviceFields),
  });
  const res = await apiClient.post<{ link: string; detail: string; recovery_token: string }>(
    "/auth/forgot-password/phone-code",
    { phone_number: phone, code },
    deviceFields ? { params: {
      device_public_key: deviceFields.devicePublicKey,
      device_nonce: deviceFields.deviceNonce,
      device_nonce_mac: deviceFields.deviceNonceMac,
      device_signature: deviceFields.deviceSignature,
      device_fingerprint: deviceFields.deviceFingerprint,
    } } : undefined
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

export const migratePhoneUserApi = async (): Promise<{
  migrated: boolean;
  ghost_user_id?: string;
  detail?: string;
}> => {
  apiLog.info("[AuthApi] Calling /gsm/migrate-phone-user");
  const res = await apiClient.post<{
    migrated: boolean;
    ghost_user_id?: string;
    detail?: string;
  }>("/gsm/migrate-phone-user");
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res.data;
};

export const setupRecoveryKeysApi = async (
  blobs: Array<{ method: string; wrapped_blob: string; metadata?: string }>
) => {
  apiLog.info("[AuthApi] Calling POST /users/recovery-setup");
  const res = await apiClient.post("/users/recovery-setup", { blobs });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const fetchRecoveryBlobApi = async (
  recoveryToken: string,
  method: string
) => {
  apiLog.info("[AuthApi] Calling GET /users/recovery-key");
  const res = await apiClient.get<{
    wrapped_blob: string;
    metadata: string | null;
    user_id: string;
  }>("/users/recovery-key", {
    params: { recovery_token: recoveryToken, method },
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const updateRecoveryKeysApi = async (
  blobs: Array<{ method: string; wrapped_blob: string; metadata?: string }>
) => {
  apiLog.info("[AuthApi] Calling PUT /users/recovery-keys");
  const res = await apiClient.put("/users/recovery-keys", { blobs });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const sendRecoveryOtpApi = async (phoneNumber: string) => {
  apiLog.info("[AuthApi] Calling POST /auth/forgot-password/otp/send");
  const res = await apiClient.post("/auth/forgot-password/otp/send", {
    phone_number: phoneNumber,
  });
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const verifyRecoveryOtpApi = async (
  phoneNumber: string,
  code: string
) => {
  apiLog.info("[AuthApi] Calling POST /auth/forgot-password/otp/verify");
  const res = await apiClient.post<{ recovery_token: string; user_id: string }>(
    "/auth/forgot-password/otp/verify",
    { phone_number: phoneNumber, code }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const sendEmailRecoveryApi = async (email: string) => {
  apiLog.info(
    "[AuthApi] Calling POST /auth/forgot-password/email-recovery/send"
  );
  const res = await apiClient.post(
    "/auth/forgot-password/email-recovery/send",
    null,
    { params: { email } }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export const verifyEmailRecoveryTokenApi = async (token: string) => {
  apiLog.info(
    "[AuthApi] Calling GET /auth/forgot-password/email-recovery/verify"
  );
  const res = await apiClient.get<{ recovery_token: string; user_id: string }>(
    "/auth/forgot-password/email-recovery/verify",
    { params: { t: token } }
  );
  apiLog.info("[AuthApi] Response received", { status: res.status });
  return res;
};

export interface RecoveryKeyConstraint {
  has_key: boolean;
  can_change: boolean;
  days_since_generated: number | null;
  days_until_changeable: number | null;
}

export interface SecurityQuestionConstraint {
  has_question: boolean;
  can_change: boolean;
  is_burned: boolean;
  is_expired: boolean;
  days_since_set: number | null;
  days_until_changeable: number | null;
  days_until_expiry: number | null;
}

export interface RecoveryConstraints {
  recovery_key: RecoveryKeyConstraint;
  security_question: SecurityQuestionConstraint;
}

export const getRecoveryConstraintsApi = async (): Promise<RecoveryConstraints> => {
  const res = await apiClient.get<RecoveryConstraints>(
    "/auth/forgot-password/recovery-constraints"
  );
  return res.data;
};
