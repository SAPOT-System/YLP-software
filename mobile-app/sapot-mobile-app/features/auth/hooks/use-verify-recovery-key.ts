import { useState } from "react";
import { ExpoFileUpload, verifyRecoveryKeyApi } from "../api";
import { AxiosError } from "axios";

export const useVerifyRecoveryKey = (identifier: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    identifier?: string;
    recoveryKey?: string;
    general?: string;
  }>({});

  const verifyRecoveryKey = async (file: ExpoFileUpload) => {
    setLoading(true);

    try {
      const res = await verifyRecoveryKeyApi(file, identifier);

      console.log(res.data);

      return {
        success: true,
        resetLink: res.data["recovery-link"],
        expiration: res.data.expire_in_seconds,
      };
    } catch (err) {
      const axiosError = err as AxiosError<{ detail: string }>;

      // Network error
      if (!axiosError.response) {
        setError({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      const status = axiosError.response.status;
      const data = axiosError.response.data;
      console.log(JSON.stringify(data, null, 2), status);

      // 400 Bad request
      if (status === 400) {
        setError({
          recoveryKey: data.detail,
        });

        return { success: false };
      }

      // 500 Server error
      if (status === 500) {
        setError({ general: "Something went wrong. Please try again later." });

        return { success: false };
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
