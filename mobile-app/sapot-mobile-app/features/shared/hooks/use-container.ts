import { useContext } from "react";
import { ContainerContext } from "../context";

export function useContainer() {
  const container = useContext(ContainerContext);
  if (!container) throw new Error("Container not initialized");
  return container;
}




