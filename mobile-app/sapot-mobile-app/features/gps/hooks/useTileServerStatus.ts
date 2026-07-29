import { useQuery } from "@tanstack/react-query";
import { gpsLog } from "@/features/shared/core/utils/logger";
import { checkTileServerReachable } from "../api/tileserver.api";

/**
 * Slower than the GPS poll on purpose: the basemap is static, so this only
 * needs to notice the tileserver coming back, not track it in real time.
 */
const POLL_INTERVAL_MS = 30_000;

/**
 * Tracks whether the basemap tileserver is reachable.
 *
 * MapLibre renders a blank canvas when tiles fail and surfaces no error event
 * for it, so the map screen has no way to distinguish "no tiles" from "no
 * data" without asking the tileserver itself. See `tileserver.api.ts`.
 */
export function useTileServerStatus() {
  gpsLog.debug("[useTileServerStatus] init");

  const { data, refetch } = useQuery({
    queryKey: ["tileserver", "reachable"],
    queryFn: checkTileServerReachable,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
    // The probe resolves to `false` rather than throwing, so react-query's
    // retry/error path never applies.
    retry: false,
  });

  return {
    // `undefined` while the first probe is in flight — don't accuse the
    // tileserver of being down before we have actually asked it.
    isUnavailable: data === false,
    recheck: refetch,
  };
}
