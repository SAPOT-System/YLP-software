import { useCallback, useState } from "react";
import baseLogger from "../utils/logger";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-loading-overlay] module loaded");

export function useLoadingOverlay(initialMessage = "") {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(initialMessage);

  const showLoading = useCallback((message?: string) => {
    hookLog.debug("[useLoadingOverlay] show", {
      hasMessage: Boolean(message?.trim()),
    });
    setLoading(true);
    if (message !== undefined) setLoadingMessage(message);
  }, []);

  const hideLoading = useCallback(() => {
    hookLog.debug("[useLoadingOverlay] hide");
    setLoading(false);
    setLoadingMessage("");
  }, []);

  return {
    loading,
    loadingMessage,
    showLoading,
    hideLoading,
    setLoadingMessage,
    setLoading,
  };
}
