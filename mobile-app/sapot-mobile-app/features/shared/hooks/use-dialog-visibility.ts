import { useCallback, useState } from "react";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-dialog-visibility] module loaded");

export function useDialogVisibility(initial = false) {
  const [visible, setVisible] = useState(initial);
  const show = useCallback(() => {
    hookLog.debug("[useDialogVisibility] show");
    setVisible(true);
  }, []);
  const hide = useCallback(() => {
    hookLog.debug("[useDialogVisibility] hide");
    setVisible(false);
  }, []);
  return { visible, show, hide };
}
