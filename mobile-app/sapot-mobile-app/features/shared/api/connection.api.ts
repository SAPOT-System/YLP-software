import { apiClient } from "./client";

export const checkBackEndHealth = async () => {
  try {
    await apiClient.get("/");
    return true;
  } catch {
    return false;
  }
};
