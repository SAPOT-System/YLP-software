import { toAppError } from "@/features/shared/errors";
import { authLog } from "@/features/shared/utils/logger";
import axios from "axios";
import { useState } from "react";
import {
  sendResetEmailCodeApi,
  verifyResetEmailCodeApi,
} from "../api/auth.api";
import { useLockoutTimer } from "./use-lockout-timer";
import { DeviceLockout429 } from "../types";

function parseDetail(detail: unknown): { message: string; attemptsRemaining: number | null } {
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const d = detail as { message: string; attempts_remaining?: number | null };
    return { message: d.message, attemptsRemaining: d.attempts_remaining ?? null };
  }
  return { message: String(detail), attemptsRemaining: null };
}

export const useEmailReset = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const lockout = useLockoutTimer("lockout_recovery_email");

  const sendCode = async (emailAddress: string) => {
    authLog.debug("[useEmailReset] sendCode called", { emailLength: emailAddress.length });
    setIsLoading(true);
    setError(null);
    setAttemptsRemaining(null);

    try {
      await sendResetEmailCodeApi(emailAddress);
      setEmail(emailAddress);
      setIsCodeSent(true);
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useEmailReset] Error in sendCode", appErr);
      setError("Failed to send reset code. Please try again.");
      setIsCodeSent(false);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (emailAddress: string, code: string) => {
    authLog.debug("[useEmailReset] verifyCode called", {
      emailLength: emailAddress.length,
      codeLength: code.length,
    });
    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyResetEmailCodeApi(emailAddress, code);
      setAttemptsRemaining(null);
      await lockout.clearLock();
      return {
        success: response.status === 200,
        recoveryLink: response.data.link,
        recoveryToken: response.data.recovery_token,
      };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useEmailReset] Error in verifyCode", appErr);
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        setAttemptsRemaining(null);
        const d = (error.response.data as { detail: DeviceLockout429 }).detail;
        await lockout.setLock(d.locked_until, d.device_type, d.attempts_remaining);
        setError("Too many attempts. Your device is temporarily locked.");
        return { success: false };
      }
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        const { message, attemptsRemaining: ar } = parseDetail(error.response.data?.detail);
        setAttemptsRemaining(ar);
        setError(message);
        return { success: false };
      }
      setError("Invalid code. Please try again.");
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    authLog.debug("[useEmailReset] reset called");
    setIsLoading(false);
    setError(null);
    setIsCodeSent(false);
    setEmail("");
    setAttemptsRemaining(null);
  };

  return { isLoading, error, isCodeSent, email, attemptsRemaining, sendCode, verifyCode, reset, lockout };
};
