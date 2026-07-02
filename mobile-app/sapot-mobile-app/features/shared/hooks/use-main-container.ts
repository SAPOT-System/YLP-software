import { useContext } from "react";
import { MainContainerContext } from "../core/context/main-container-context";
import { hookLog } from "../core/utils/logger";
hookLog.debug("[use-main-container] module loaded");

export function useMainContainer() {
  const container = useContext(MainContainerContext);
  if (!container) {
    hookLog.error("[useMainContainer] container missing");
    throw new Error("Container not initialized");
  }
  return container;
}
