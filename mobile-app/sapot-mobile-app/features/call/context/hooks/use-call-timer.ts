import { hookLog } from "@/features/shared/utils/logger";
import { useCallback, useEffect, useState } from "react";

hookLog.debug("[use-call-timer] module loaded");

// Temporary local type for isolated development; replaced by the shared
// import from ./use-call-lifecycle in Task 8.
type CallState =
  | "calling" | "answering" | "connected"
  | "reconnecting" | "ended" | "no-answer" | "busy";

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
