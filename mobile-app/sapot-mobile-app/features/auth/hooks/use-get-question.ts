import { useEffect, useState } from "react";
import { authLog } from "../../shared/utils/logger";
import { getSecurityQuestionApi } from "../api";

export const useGetQuestion = (identfier: string) => {
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");

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
      } finally {
        setLoading(false);
      }
    };

    getQuestion();
  }, [identfier]);

  return { loading, question };
};
