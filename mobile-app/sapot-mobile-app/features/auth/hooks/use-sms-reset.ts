import { toAppError } from "@/features/shared/core/errors";
import { authLog } from "@/features/shared/core/utils/logger";
import axios from "axios";
import { useState } from "react";
import { sendResetSmsCodeApi, verifyResetSmsCodeApi } from "../api/auth.api";
import { useLockoutTimer } from "./use-lockout-timer";
import { DeviceLockout429 } from "../types";

function parseDetail(detail: unknown): { message: string; attemptsRemaining: number | null } {
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const d = detail as { message: string; attempts_remaining?: number | null };
    return { message: d.message, attemptsRemaining: d.attempts_remaining ?? null };
  }
  return { message: String(detail), attemptsRemaining: null };
}

export const useSmsReset = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [phone, setPhone] = useState<string>("");
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const lockout = useLockoutTimer("lockout_recovery_phone");

  const sendCode = async (phoneNumber: string) => {
    authLog.debug("[useSmsReset] sendCode called", { phoneLength: phoneNumber.length });
    setIsLoading(true);
    setError(null);
    setAttemptsRemaining(null);

    try {
      await sendResetSmsCodeApi(phoneNumber);
      setPhone(phoneNumber);
      setIsCodeSent(true);
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useSmsReset] Error in sendCode", appErr);
      const detail = axios.isAxiosError(error)
        ? (error.response?.data as { detail?: string })?.detail
        : undefined;
      setError(detail ?? "Failed to send reset code. Please try again.");
      setIsCodeSent(false);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (phoneNumber: string, code: string) => {
    if (lockout.isLocked) return { success: false };
    authLog.debug("[useSmsReset] verifyCode called", {
      phoneLength: phoneNumber.length,
      codeLength: code.length,
    });
    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyResetSmsCodeApi(phoneNumber, code);
      const rt = response.data.recovery_token ?? null;
      setAttemptsRemaining(null);
      await lockout.clearLock();
      setRecoveryToken(rt);
      return {
        success: response.status === 200,
        recoveryLink: response.data.link,
        recoveryToken: rt,
      };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useSmsReset] Error in verifyCode", appErr);
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
    authLog.debug("[useSmsReset] reset called");
    setIsLoading(false);
    setError(null);
    setIsCodeSent(false);
    setPhone("");
    setAttemptsRemaining(null);
  };

  return { isLoading, error, isCodeSent, phone, recoveryToken, attemptsRemaining, sendCode, verifyCode, reset, lockout };
};
