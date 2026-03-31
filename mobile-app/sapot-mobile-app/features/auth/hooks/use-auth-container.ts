import { useContext } from "react";
import { AuthContainerContext } from "../context/auth-container-context";

export function useAuthContainer() {
  const container = useContext(AuthContainerContext);
  if (!container) throw new Error("User Container not initialized");
  return container;
}
