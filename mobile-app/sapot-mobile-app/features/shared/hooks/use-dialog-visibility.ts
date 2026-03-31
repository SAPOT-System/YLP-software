import { useState, useCallback } from "react";

export function useDialogVisibility(initial = false) {
  const [visible, setVisible] = useState(initial);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);
  return { visible, show, hide };
}
