import { useEffect, useState } from "react";
import { getSecurityQuestionApi } from "../api";

export const useGetQuestion = (identfier: string) => {
  if (!identfier) return;
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    const getQuestion = async () => {
      setLoading(true);

      try {
        console.log(identfier);
        const res = await getSecurityQuestionApi(identfier);
        const { question } = res.data;
        setQuestion(question);
      } catch (err) {
        console.error(err);
        console.error("[useGetQuestion]: Error getting question");
      } finally {
        setLoading(false);
      }
    };

    getQuestion();
  }, []);

  return { loading, question };
};
