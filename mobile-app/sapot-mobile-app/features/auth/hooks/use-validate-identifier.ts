import { useState } from "react";
import { existsApi } from "../api";
import { AxiosError } from "axios";

export const useValidateIdentifier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ identifier?: string; general?: string }>(
    {}
  );

  const validateIdentfier = async (identfier: string) => {
    setLoading(true);

    try {
      const res = await existsApi(identfier);
      const { exists } = res;

      if (!exists) {
        setError({ identifier: "Invalid account" });
      }

      return { success: exists };
    } catch (err) {
      const axiosError = err as AxiosError;

      // Network error
      if (!axiosError.response) {
        setError({
          general: "Network error. Please check your connection to the server.",
        });
        return { success: false };
      }

      const status = axiosError.response.status;

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
