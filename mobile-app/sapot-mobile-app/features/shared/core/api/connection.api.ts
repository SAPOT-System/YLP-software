import { apiLog } from "@/features/shared/core/utils/logger";
import { apiClient } from "./client";
apiLog.debug("[connection-api] module loaded");

export const checkBackEndHealth = async () => {
  try {
    apiLog.debug("api › health check start");
    await apiClient.get("/");
    apiLog.info("api › health check ok");
    return true;
  } catch (error) {
    apiLog.warn("api › health check failed", { error });
    return false;
  }
};

export const pingServer = async () => {
  // const start = Date.now();

  try {
    apiLog.debug("api › ping start");
    const res = await apiClient.get<{ status: string; timestamp: number }>("/ping");

    const latency = Date.now() - res.data.timestamp;

    return {
      success: true,
      latency,
    };
  } catch (error) {
    apiLog.warn("api › ping failed", { error });
    return {
      success: false,
      latency: null,
    };
  }
};
