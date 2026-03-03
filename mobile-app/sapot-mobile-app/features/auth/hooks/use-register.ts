import { AxiosError } from "axios";
import { useState } from "react";
import { register } from "../api/auth.api";
import {
    RegisterApiErrorResponse,
    RegisterFormState,
    RegisterFormStateErrors,
} from "../types";
import { hasValidationErrors, validateRegistrationForm } from "../utils";

export const useRegister = () => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<RegisterFormStateErrors>({});

  const registerUser = async (
    form: RegisterFormState
  ): Promise<{ success: boolean }> => {
    setLoading(true);
    setErrors({});

    const errors = validateRegistrationForm(form);

    if (hasValidationErrors(errors)) {
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
        phone_number: "phoneNumber",
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
        email: form.email,
        phone_number: form.phoneNumber,
      });

      return { success: res.status === 201 };
    } catch (err) {
      const axiosError = err as AxiosError<RegisterApiErrorResponse>;

      // Network error
      if (!axiosError.response) {
        setErrors({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      const status = axiosError.response.status;
      const data = axiosError.response.data;

      // 422 Unprocessable Entity - validation errors
      if (status === 422 && Array.isArray(data.detail)) {
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
        const serverErrors = data.detail;

        setErrors(mapServerErrors(serverErrors));

        return { success: false };
      }

      // 500 Server error
      if (status === 500) {
        setErrors({ general: "Server error. Please try again later." });

        return { success: false };
      }

      // Generic error
      // TODO: Add the message from the server response
      setErrors({
        general: "An error occurred. Please try again",
      });

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const validateRegisterStep = (form: Partial<RegisterFormState>) => {
    setLoading(true);
    const errors = validateRegistrationForm(form);
    if (hasValidationErrors(errors)) {
      setErrors(errors);
      setLoading(false);
      return { success: false };
    }
    setLoading(false);
    return { success: true };
  };
  return { registerUser, validateRegisterStep, loading, errors };
};
