import { AxiosError } from "axios";
import { useCallback, useEffect, useState } from "react";
import { authLog } from "../../shared/utils/logger";
import { getSecurityQuestionApi } from "../api";

export const useGetQuestion = (identfier: string) => {
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const getQuestion = async () => {
      if (!identfier) {
        setQuestion("");
        return;
      }
      setLoading(true);

      try {
        authLog.debug("auth › fetch security question", {
          hasIdentifier: Boolean(identfier),
        });
        const res = await getSecurityQuestionApi(identfier);
        const { question } = res.data;
        setQuestion(question);
      } catch (err) {
        authLog.error("auth › fetch security question failed", { error: err });
        const axiosError = err as AxiosError<{ detail: string }>;
        if (axiosError.response) {
          const status = axiosError.response.status;
          const data = axiosError.response.data;

          if (status === 404) {
            setError(data.detail);
          } else {
            setError("Failed to load security question. Please try again.");
          }
        } else {
          setError("Failed to load security question. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    getQuestion();
  }, [identfier, retryCount]);

  const refetch = useCallback(() => {
    setError("");
    setRetryCount((c) => c + 1);
  }, []);

  return { loading, question, error, refetch };
};
