import { authLog } from "@/features/shared/utils/logger";
import axios from "axios";
import { useState } from "react";
import { sendResetSmsCodeApi, verifyResetSmsCodeApi, verifyRecoveryOtpApi } from "../api/auth.api";

export const useSmsReset = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [phone, setPhone] = useState<string>("");
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);

  const sendCode = async (phoneNumber: string) => {
    authLog.debug("[useSmsReset] sendCode called", {
      phoneLength: phoneNumber.length,
    });
    setIsLoading(true);
    setError(null);

    try {
      await sendResetSmsCodeApi(phoneNumber);
      setPhone(phoneNumber);
      setIsCodeSent(true);
      return { success: true };
    } catch (err) {
      authLog.error("[useSmsReset] Error in sendCode", { error: err });
      const detail = axios.isAxiosError(err)
        ? (err.response?.data as { detail?: string })?.detail
        : undefined;
      setError(detail ?? "Failed to send reset code. Please try again.");
      setIsCodeSent(false);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (phoneNumber: string, code: string) => {
    authLog.debug("[useSmsReset] verifyCode called", {
      phoneLength: phoneNumber.length,
      codeLength: code.length,
    });
    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyResetSmsCodeApi(phoneNumber, code);
      try {
        const recoveryRes = await verifyRecoveryOtpApi(phoneNumber, code);
        setRecoveryToken(recoveryRes.data.recovery_token);
        setRecoveryUserId(recoveryRes.data.user_id);
      } catch {
        // Recovery token fetch is best-effort; don't fail the reset flow
      }
      return {
        success: response.status === 200,
        recoveryLink: response.data.link,
      };
    } catch (err) {
      authLog.error("[useSmsReset] Error in verifyCode", { error: err });
      const detail = axios.isAxiosError(err)
        ? (err.response?.data as { detail?: string })?.detail
        : undefined;
      setError(detail ?? "Invalid code. Please try again.");
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
  };

  return {
    isLoading,
    error,
    isCodeSent,
    phone,
    recoveryToken,
    recoveryUserId,
    sendCode,
    verifyCode,
    reset,
  };
};
