import { useContext } from "react";
import { MainContainerContext } from "../context";

export function useMainContainer() {
  const container = useContext(MainContainerContext);
  if (!container) throw new Error("Container not initialized");
  return container;
}
