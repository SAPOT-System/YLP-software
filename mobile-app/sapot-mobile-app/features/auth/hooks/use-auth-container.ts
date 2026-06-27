import { authLog } from "@/features/shared/core/utils/logger";
import { useContext } from "react";
import { AuthContainerContext } from "../context/auth-container-context";

export function useAuthContainer() {
  const container = useContext(AuthContainerContext);
  if (!container) {
    authLog.error("[useAuthContainer] container missing");
    throw new Error("User Container not initialized");
  }
  return container;
}
