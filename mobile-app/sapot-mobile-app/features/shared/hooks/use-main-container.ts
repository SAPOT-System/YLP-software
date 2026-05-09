import { useContext } from "react";
import { MainContainerContext } from "../context/main-container-context";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-main-container] module loaded");

export function useMainContainer() {
  const container = useContext(MainContainerContext);
  if (!container) {
    hookLog.error("[useMainContainer] container missing");
    throw new Error("Container not initialized");
  }
  return container;
}
