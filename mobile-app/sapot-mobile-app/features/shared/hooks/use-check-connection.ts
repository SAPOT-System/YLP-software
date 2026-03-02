import { useState } from "react";
import { checkBackEndHealth } from "../api";

export const useCheckConnection = () => {
  const [loading, setLoading] = useState(false);
  const checkBackendConnection = async () => {
    setLoading(true);
    try {
      return await checkBackEndHealth();
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  };
  return { checkBackendConnection, loading };
};
