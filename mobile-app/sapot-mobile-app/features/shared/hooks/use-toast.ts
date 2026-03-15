import { useState } from "react";

export const useToast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  const showToast = (msg: string) => {
    setMessage(msg);
    setVisible(true);
  };

  const hideToast = () => setVisible(false);

  return { visible, message, showToast, hideToast };
};
