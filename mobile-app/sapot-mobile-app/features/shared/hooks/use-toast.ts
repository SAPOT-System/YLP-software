import { useCallback, useState } from "react";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-toast] module loaded");

type ToastVariant = "neutral" | "error";

export const useToast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<ToastVariant>("neutral");

  const showToast = useCallback((msg: string) => {
    hookLog.debug("[useToast] show", { messageLength: msg.length });
    setMessage(msg);
    setVariant("neutral");
    setVisible(true);
  }, []);

  const showError = useCallback((msg: string) => {
    hookLog.debug("[useToast] showError", { messageLength: msg.length });
    setMessage(msg);
    setVariant("error");
    setVisible(true);
  }, []);

  const hideToast = useCallback(() => {
    hookLog.debug("[useToast] hide");
    setVisible(false);
  }, []);

  return { visible, message, variant, showToast, showError, hideToast };
};
