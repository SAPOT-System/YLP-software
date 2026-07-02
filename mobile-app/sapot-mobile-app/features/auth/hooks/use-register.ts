import { toAppError, captureAppError } from "@/features/shared/core/errors";
import { authLog } from "@/features/shared/core/utils/logger";
import { isAxiosError } from "axios";
import { setItemAsync } from "expo-secure-store";
import { useState } from "react";
import { existsApi, register } from "../api/auth.api";
import {
  RegisterApiErrorResponse,
  RegisterApiResponse,
  RegisterFormState,
  RegisterFormStateErrors,
} from "../types";
import {
  hasValidationErrors,
  validateRegistrationForm,
} from "../utils";

export const useRegister = () => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<RegisterFormStateErrors>({});

  const registerUser = async (
    form: RegisterFormState
  ): Promise<{
    success: boolean;
    info?: RegisterApiResponse;
  }> => {
    authLog.debug("[useRegister] registerUser called", {
      hasUsername: Boolean(form.username?.trim()),
      hasFirstName: Boolean(form.firstName?.trim()),
      hasLastName: Boolean(form.lastName?.trim()),
      password: "[REDACTED]",
    });
    setLoading(true);
    setErrors({});

    const errors = validateRegistrationForm(form);

    if (hasValidationErrors(errors)) {
      authLog.warn("[useRegister] validation failed");
      setErrors(errors);
      setLoading(false);
      return { success: false };
    }

    // Mapping from server keys to client keys
    function mapServerErrors(
      serverErrors: Record<string, string>
    ): RegisterFormStateErrors {
      const errorKeyMap: Record<string, string> = {
        first_name: "firstName",
        last_name: "lastName",
      };

      const clientErrors: RegisterFormStateErrors = {};
      for (const key in serverErrors) {
        const clientKey = errorKeyMap[key] || key; // fallback to original if not mapped
        clientErrors[clientKey as keyof RegisterFormStateErrors] =
          serverErrors[key];
      }
      return clientErrors;
    }

    try {
      const res = await register({
        username: form.username,
        first_name: form.firstName,
        last_name: form.lastName,
        password: form.password,
        terms_accepted: true,
      });
      const data = res.data;

      await setItemAsync("access_token", data.access_token);
      await setItemAsync("refresh_token", data.refresh_token);

      return {
        success: res.status === 201,
        info: data,
      };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      captureAppError(appErr);
      authLog.error("[useRegister] Error in registerUser", appErr);

      // Network error
      if (isAxiosError(error) && !error.response) {
        setErrors({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      if (isAxiosError(error) && error.response) {
        const status = error.response.status;
        const data = error.response.data as RegisterApiErrorResponse;

        // 422 Unprocessable Entity - validation errors
        if (status === 422 && Array.isArray(data.detail)) {
          authLog.warn("[useRegister] validation error response", { status });
          const fieldErrors = {};
          data.detail.forEach((detail) => {
            const fieldName = String(detail.loc[1]); // Convert to string explicitly
            const message = detail.msg;
            const serverError = mapServerErrors({ [fieldName]: message });
            Object.assign(fieldErrors, serverError);
          });
          setErrors(fieldErrors);

          return { success: false };
        }

        if (status === 400 && !Array.isArray(data.detail)) {
          authLog.warn("[useRegister] bad request response", { status });
          const serverErrors = data.detail;

          setErrors(mapServerErrors(serverErrors as Record<string, string>));

          return { success: false };
        }

        // 500 Server error
        if (status === 500) {
          authLog.error("[useRegister] server error response", { status });
          setErrors({ general: "Server error. Please try again later." });

          return { success: false };
        }

        // Generic error
        setErrors({
          general:
            (error.response?.data as { detail?: string })?.detail ??
            "An error occurred. Please try again",
        });
      } else {
        // Generic error
        setErrors({ general: appErr.message });
      }

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const checkIfIdentifierExists = async (identifier: string) => {
    try {
      authLog.debug("[useRegister] checkIfIdentifierExists called", {
        identifierLength: identifier.length,
      });
      const { exists } = await existsApi(identifier);
      return exists;
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useRegister] Error in checkIfIdentifierExists", appErr);
      return false;
    }
  };

  const validateRegisterStep = (form: Partial<RegisterFormState>) => {
    authLog.debug("[useRegister] validateRegisterStep called", {
      hasUsername: Boolean(form.username?.trim()),
      hasFirstName: Boolean(form.firstName?.trim()),
      hasLastName: Boolean(form.lastName?.trim()),
      hasPassword: Boolean(form.password),
      hasConfirmPassword: Boolean(form.confirmPassword),
      termsChecked: Boolean(form.termsChecked),
    });
    const errors = validateRegistrationForm(form);
    if (hasValidationErrors(errors)) {
      authLog.warn("[useRegister] validateRegisterStep failed");
      setErrors(errors);
      return { success: false };
    }
    return { success: true };
  };
  return {
    registerUser,
    validateRegisterStep,
    checkIfIdentifierExists,
    loading,
    setErrors,
    errors,
  };
};
