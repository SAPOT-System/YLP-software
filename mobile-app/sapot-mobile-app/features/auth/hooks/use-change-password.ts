import { authLog } from "@/features/shared/utils/logger";
import { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { canResetPasswordApi, resetPasswordApi } from "../api/auth.api";
import { hasValidationErrors, validatePassword } from "../utils";

export const useChangePassword = (token: string) => {
  const [loading, setLoading] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null);

  const [errors, setErrors] = useState<{
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  useEffect(() => {
    const validateToken = async () => {
      authLog.debug("[useChangePassword] validateToken called", {
        hasToken: Boolean(token),
      });
      if (!token) {
        setIsTokenValid(null);
        return;
      }
      try {
        const canChangePassword = await canResetPasswordApi(token);
        setIsTokenValid(canChangePassword);
      } catch (error) {
        authLog.error("[useChangePassword] Error in validateToken", { error });
        setIsTokenValid(false);
      }
    };
    validateToken();
  }, [token]);

  const changePassword = async (form: {
    password: string;
    confirmPassword: string;
    identifier: string;
  }) => {
    authLog.debug("[useChangePassword] changePassword called", {
      password: "[REDACTED]",
      confirmPassword: "[REDACTED]",
      identifierLength: form.identifier.length,
    });
    if (!token) {
      setErrors({ general: "Reset token is missing. Please start again." });
      return { success: false };
    }
    setLoading(true);
    setErrors({});

    const errors = validatePassword(form.password, form.confirmPassword);

    if (hasValidationErrors(errors)) {
      authLog.warn("[useChangePassword] validation failed");
      setErrors(errors);
      setLoading(false);
      return { success: false };
    }

    try {
      const res = await resetPasswordApi(token, form.password);

      return { success: res.status === 200 };
    } catch (err) {
      authLog.error("[useChangePassword] Error in changePassword", {
        error: err,
      });
      const axiosError = err as AxiosError<{ detail: string }>;

      // Network error
      if (!axiosError.response) {
        setErrors({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      const status = axiosError.response.status;
      const data = axiosError.response.data;

      if (status === 403) {
        setErrors({ general: data.detail });

        return { success: false };
      }

      // 500 Server error
      if (status === 500) {
        setErrors({ general: "Server error. Please try again later." });

        return { success: false };
      }

      // Generic error
      setErrors({
        general: data?.detail ?? "An error occurred. Please try again",
      });

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { changePassword, loading, errors, isTokenValid };
};
