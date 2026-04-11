import { AxiosError } from "axios";
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
        return { success: res.data.correct, resetLink: res.data.reset_link };
      } else {
        setError({ answer: "Wrong answer" });
        return { success: false };
      }
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
      // TODO: Add the message from the server response
      setError({ general: "Invalid. Please try again" });

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, verifyAnswer };
};
