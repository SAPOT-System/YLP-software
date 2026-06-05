import { toAppError, captureAppError } from "@/features/shared/errors";
import { authLog } from "@/features/shared/utils/logger";
import { useState } from "react";
import {
    sendResetEmailCodeApi,
    verifyResetEmailCodeApi,
} from "../api/auth.api";

export const useEmailReset = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [email, setEmail] = useState<string>("");

  const sendCode = async (emailAddress: string) => {
    authLog.debug("[useEmailReset] sendCode called", {
      emailLength: emailAddress.length,
    });
    setIsLoading(true);
    setError(null);

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
      return {
        success: response.status === 200,
        recoveryLink: response.data.link,
        recoveryToken: response.data.recovery_token,
      };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useEmailReset] Error in verifyCode", appErr);
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
  };

  return {
    isLoading,
    error,
    isCodeSent,
    email,
    sendCode,
    verifyCode,
    reset,
  };
};
