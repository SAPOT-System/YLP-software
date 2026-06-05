import { toAppError } from "@/features/shared/errors";
import { useState } from "react";
import { checkBackEndHealth } from "../api";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-check-connection] module loaded");

export const useCheckConnection = () => {
  const [loading, setLoading] = useState(false);
  const checkBackendConnection = async () => {
    setLoading(true);
    try {
      hookLog.debug("[useCheckConnection] check start");
      return await checkBackEndHealth();
    } catch (error) {
      const appErr = toAppError(error, "network");
      hookLog.warn("[useCheckConnection] check failed", appErr);
      return false;
    } finally {
      setLoading(false);
    }
  };
  return { checkBackendConnection, loading };
};
