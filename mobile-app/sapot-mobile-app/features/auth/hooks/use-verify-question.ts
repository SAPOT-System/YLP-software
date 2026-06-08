import { toAppError } from "@/features/shared/errors";
import { isAxiosError } from "axios";
import { useState } from "react";
import { authLog } from "../../shared/utils/logger";
import { verifySecurityQuestionApi } from "../api";
import { useLockoutTimer } from "./use-lockout-timer";
import { DeviceLockout429 } from "../types";

export const useVerifyAnswer = (identifier: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ answer?: string; general?: string }>({});
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const lockout = useLockoutTimer("lockout_recovery_question");

  const verifyAnswer = async ({
    question,
    answer,
  }: {
    question: string;
    answer: string;
  }) => {
    if (lockout.isLocked) return { success: false };
    authLog.debug("[useVerifyAnswer] verifyAnswer called", {
      hasIdentifier: Boolean(identifier),
      hasQuestion: Boolean(question),
      hasAnswer: Boolean(answer),
    });
    setError({});
    setLoading(true);

    try {
      const res = await verifySecurityQuestionApi(identifier, { question, answer });
      authLog.debug("auth › security question verified", { correct: res.data.correct });

      if (res.data.correct) {
        setAttemptsRemaining(null);
        await lockout.clearLock();
        return { success: true, resetLink: res.data.reset_link, recoveryToken: res.data.recovery_token };
      } else {
        setAttemptsRemaining(res.data.attempts_remaining ?? null);
        setError({ answer: "Wrong answer" });
        return { success: false };
      }
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useVerifyAnswer] Error in verifyAnswer", appErr);

      if (isAxiosError(error) && !error.response) {
        setError({ general: "Network error. Please check your connection to the server." });
        return { success: false };
      }

      if (isAxiosError(error) && error.response) {
        const status = error.response.status;

        if (status === 429) {
          setAttemptsRemaining(null);
          const d = (error.response.data as { detail: DeviceLockout429 }).detail;
          await lockout.setLock(d.locked_until, d.device_type, d.attempts_remaining);
          setError({ general: "Too many attempts. Your device is temporarily locked." });
          return { success: false };
        }

        const data = error.response.data as { detail: string };

        if (status === 404 && data.detail) {
          setError({ answer: data.detail });
          return { success: false };
        }

        if (status === 500) {
          setError({ general: "Invalid. Please try again later." });
          return { success: false };
        }

        setError({ general: data?.detail ?? "Invalid. Please try again" });
      } else {
        setError({ general: appErr.message });
      }

      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, attemptsRemaining, verifyAnswer, lockout };
};
