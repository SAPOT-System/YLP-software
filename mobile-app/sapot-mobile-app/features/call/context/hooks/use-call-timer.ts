import { hookLog } from "@/features/shared/core/utils/logger";
import { useCallback, useEffect, useState } from "react";
import type { CallState } from "./use-call-lifecycle";

hookLog.debug("[use-call-timer] module loaded");

export function useCallTimer(callState: CallState): {
  elapsed: number;
  resetElapsed: () => void;
} {
  const [elapsed, setElapsed] = useState(0);
  const resetElapsed = useCallback(() => setElapsed(0), []);

  useEffect(() => {
    if (callState !== "connected") return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  return { elapsed, resetElapsed };
}
