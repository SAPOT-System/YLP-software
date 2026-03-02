import { useState, useCallback } from "react";

export function useLoadingOverlay(initialMessage = "") {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(initialMessage);

  const showLoading = useCallback((message?: string) => {
    setLoading(true);
    if (message !== undefined) setLoadingMessage(message);
  }, []);

  const hideLoading = useCallback(() => {
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
