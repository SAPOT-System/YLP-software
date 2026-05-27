import { useEffect, useState } from "react";
import { pingServer } from "../api";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-ping] module loaded");

export const usePing = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const [latency, setLatency] = useState<number | null>();
  const [online, setOnline] = useState<boolean>(false);
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(async () => {
      try {
        const result = await pingServer();
        hookLog.debug("[usePing] result", {
          success: result.success,
          latency: result.latency ?? undefined,
        });
        setLatency(result.latency);
        setOnline(result.success);
      } catch (error) {
        hookLog.warn("[usePing] failed", { error });
        setLatency(null);
        setOnline(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [enabled]);
  return { latency, online };
};
