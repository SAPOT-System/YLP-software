import { getGsmHealth } from "@/features/shared/core/api/gsm.api";
import { hookLog } from "@/features/shared/core/utils/logger";
import { useEffect, useState } from "react";
hookLog.debug("[use-gsm-health] module loaded");

const GSM_POLL_INTERVAL_MS = 30_000;

export function useGsmHealth(): { gsmReady: boolean; loading: boolean } {
  const [gsmReady, setGsmReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = (isInitial: boolean) => {
      if (isInitial) setLoading(true);
      getGsmHealth()
        .then((res) => { if (!cancelled) setGsmReady(res.gsm_ready === true); })
        .catch(() => { if (!cancelled) setGsmReady(false); })
        .finally(() => { if (isInitial && !cancelled) setLoading(false); });
    };

    check(true);
    const id = setInterval(() => check(false), GSM_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { gsmReady, loading };
}
