import { toAppError } from "@/features/shared/core/errors";
import { authLog } from "@/features/shared/core/utils/logger";
import { isAxiosError } from "axios";
import { useState } from "react";
import { existsApi } from "../api";

export const useValidateIdentifier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ identifier?: string; general?: string }>(
    {}
  );

  const validateIdentfier = async (identfier: string) => {
    authLog.debug("[useValidateIdentifier] validateIdentfier called", {
      identifierLength: identfier.length,
    });
    setLoading(true);

    try {
      const res = await existsApi(identfier);
      const { exists } = res;

      if (!exists) {
        authLog.warn("[useValidateIdentifier] identifier not found");
        setError({ identifier: "Invalid account" });
      }

      return { success: exists };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useValidateIdentifier] Error in validateIdentfier", appErr);

      // Network error
      if (isAxiosError(error) && !error.response) {
        setError({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      if (isAxiosError(error) && error.response) {
        const status = error.response.status;
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

  return { loading, error, validateIdentfier };
};

//   const checkIfIdentifierExists = async (identifier: string) => {
//     try {
//       const res = await existsApi(identifier);
//       return res.data.exists;
//     } catch {
//       return false;
//     }
//   };
