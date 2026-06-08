import { toAppError } from "@/features/shared/errors";
import { isAxiosError } from "axios";
import { useState } from "react";
import { authLog } from "../../shared/utils/logger";
import { ExpoFileUpload, verifyRecoveryKeyApi } from "../api";
import { useLockoutTimer } from "./use-lockout-timer";
import { DeviceLockout429 } from "../types";

function parseDetail(detail: unknown): { message: string; attemptsRemaining: number | null } {
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const d = detail as { message: string; attempts_remaining?: number | null };
    return { message: d.message, attemptsRemaining: d.attempts_remaining ?? null };
  }
  return { message: String(detail), attemptsRemaining: null };
}

export const useVerifyRecoveryKey = (identifier: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ identifier?: string; recoveryKey?: string; general?: string }>({});
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const lockout = useLockoutTimer("lockout_recovery_key");

  const verifyRecoveryKey = async (file: ExpoFileUpload) => {
    authLog.debug("[useVerifyRecoveryKey] verifyRecoveryKey called", {
      hasIdentifier: Boolean(identifier),
      hasFile: Boolean(file),
    });
    setError({});
    setLoading(true);

    try {
      const res = await verifyRecoveryKeyApi(file, identifier);
      authLog.debug("auth › recovery key verified", { expiresInSeconds: res.data.expire_in_seconds });

      setAttemptsRemaining(null);
      await lockout.clearLock();
      return {
        success: true,
        resetLink: res.data["recovery-link"],
        expiration: res.data.expire_in_seconds,
        recoveryToken: res.data.recovery_token,
      };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useVerifyRecoveryKey] Error in verifyRecoveryKey", appErr);

      if (isAxiosError(error) && !error.response) {
        setError({ general: "Network error. Please check your connection to the server." });
        return { success: false };
      }

      if (isAxiosError(error) && error.response) {
        const status = error.response.status;
        authLog.warn("auth › recovery key verification failed", { status });

        if (status === 429) {
          setAttemptsRemaining(null);
          const d = (error.response.data as { detail: DeviceLockout429 }).detail;
          await lockout.setLock(d.locked_until, d.device_type, d.attempts_remaining);
          setError({ general: "Too many attempts. Your device is temporarily locked." });
          return { success: false };
        }

        if (status === 400) {
          const { message, attemptsRemaining: ar } = parseDetail(error.response.data?.detail);
          setAttemptsRemaining(ar);
          setError({ recoveryKey: message });
          return { success: false };
        }

        if (status === 500) {
          setError({ general: "Something went wrong. Please try again later." });
          return { success: false };
        }
      }

      setError({ general: "Something went wrong. Please try again later." });
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, attemptsRemaining, verifyRecoveryKey, lockout };
};
