import { toAppError } from "@/features/shared/errors";
import { isAxiosError } from "axios";
import { useState } from "react";
import { authLog } from "../../shared/utils/logger";
import { verifySecurityQuestionApi } from "../api";

export const useVerifyAnswer = (identifier: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ answer?: string; general?: string }>({});

  const verifyAnswer = async ({
    question,
    answer,
  }: {
    question: string;
    answer: string;
  }) => {
    authLog.debug("[useVerifyAnswer] verifyAnswer called", {
      hasIdentifier: Boolean(identifier),
      hasQuestion: Boolean(question),
      hasAnswer: Boolean(answer),
    });
    setLoading(true);

    try {
      const res = await verifySecurityQuestionApi(identifier, {
        question,
        answer,
      });
      authLog.debug("auth › security question verified", {
        correct: res.data.correct,
      });

      if (res.data.correct) {
        return { success: true, resetLink: res.data.reset_link, recoveryToken: res.data.recovery_token };
      } else {
        setError({ answer: "Wrong answer" });
        return { success: false };
      }
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useVerifyAnswer] Error in verifyAnswer", appErr);

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

        if (status === 404 && data.detail) {
          setError({ answer: data.detail });
          return { success: false };
        }

        // 500 Server error
        if (status === 500) {
          setError({ general: "Invalid. Please try again later." });
          return { success: false };
        }

        // Generic error
        setError({ general: data?.detail ?? "Invalid. Please try again" });
      } else {
        setError({ general: appErr.message });
      }

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, verifyAnswer };
};
