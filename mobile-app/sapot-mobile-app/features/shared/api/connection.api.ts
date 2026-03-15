import { apiClient } from "./client";

export const checkBackEndHealth = async () => {
  try {
    await apiClient.get("/");
    return true;
  } catch {
    return false;
  }
};

export const pingServer = async () => {
  // const start = Date.now();

  try {
    const res = await apiClient.get<{ status: string; timestamp: number }>("/ping");

    const latency = Date.now() - res.data.timestamp;

    return {
      success: true,
      latency,
    };
  } catch {
    return {
      success: false,
      latency: null,
    };
  }
};
