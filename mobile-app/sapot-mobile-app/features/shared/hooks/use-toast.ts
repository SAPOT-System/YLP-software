import { useCallback, useState } from "react";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-toast] module loaded");

export const useToast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  const showToast = useCallback((msg: string) => {
    hookLog.debug("[useToast] show", { messageLength: msg.length });
    setMessage(msg);
    setVisible(true);
  }, []);

  const hideToast = useCallback(() => {
    hookLog.debug("[useToast] hide");
    setVisible(false);
  }, []);

  return { visible, message, showToast, hideToast };
};
