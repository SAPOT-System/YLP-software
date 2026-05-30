import { useEffect, useState } from "react";
import { checkBackEndHealth } from "../api/connection.api";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-health-poll] module loaded");

export function useHealthPoll(intervalMs = 5000, enabled = true) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(async () => {
      const ok = await checkBackEndHealth();
      hookLog.debug("[useHealthPoll] poll result", { ok });
      setOnline(ok);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, enabled]);

  return { online };
}
