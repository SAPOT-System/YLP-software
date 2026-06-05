import { toAppError, captureAppError } from "@/features/shared/errors";
import { isAxiosError } from "axios";
import { useState } from "react";
import { authLog } from "../../shared/utils/logger";
import { ExpoFileUpload, verifyRecoveryKeyApi } from "../api";

export const useVerifyRecoveryKey = (identifier: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    identifier?: string;
    recoveryKey?: string;
    general?: string;
  }>({});

  const verifyRecoveryKey = async (file: ExpoFileUpload) => {
    authLog.debug("[useVerifyRecoveryKey] verifyRecoveryKey called", {
      hasIdentifier: Boolean(identifier),
      hasFile: Boolean(file),
    });
    setLoading(true);

    try {
      const res = await verifyRecoveryKeyApi(file, identifier);
      authLog.debug("auth › recovery key verified", {
        expiresInSeconds: res.data.expire_in_seconds,
      });

      return {
        success: true,
        resetLink: res.data["recovery-link"],
        expiration: res.data.expire_in_seconds,
        recoveryToken: res.data.recovery_token,
      };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useVerifyRecoveryKey] Error in verifyRecoveryKey", appErr);

      // Network error
      if (isAxiosError(error) && !error.response) {
        setError({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      if (isAxiosError(error) && error.response) {
        const status = error.response.status;
        const data = error.response.data as { detail: string };
        authLog.warn("auth › recovery key verification failed", { status });

        // 400 Bad request
        if (status === 400) {
          setError({ recoveryKey: data.detail });
          return { success: false };
        }

        // 500 Server error
        if (status === 500) {
          setError({ general: "Something went wrong. Please try again later." });
          return { success: false };
        }
      }

      // Generic error
      setError({ general: "Something went wrong. Please try again later." });

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, verifyRecoveryKey };
};
