import { useCallback, useState } from "react";

export const useToast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
  }, []);

  const hideToast = useCallback(() => setVisible(false), []);

  return { visible, message, showToast, hideToast };
};
