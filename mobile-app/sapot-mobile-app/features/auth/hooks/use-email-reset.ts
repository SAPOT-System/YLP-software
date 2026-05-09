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
      authLog.error("[useEmailReset] Error in sendCode", { error });
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
      };
    } catch (error) {
      authLog.error("[useEmailReset] Error in verifyCode", { error });
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
