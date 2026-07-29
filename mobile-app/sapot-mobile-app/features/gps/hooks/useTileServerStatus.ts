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
 *
 * @param tileServerUrl Base URL of the tileserver the caller is rendering
 * tiles from — pass the same value the map's tile URL was built from, so the
 * status can never describe a different host than the one on screen.
 */
export function useTileServerStatus(tileServerUrl: string) {
  gpsLog.debug("[useTileServerStatus] init");

  const { data, refetch } = useQuery({
    // Keyed by host so a changed override is tracked as its own status
    // rather than inheriting the previous host's result.
    queryKey: ["tileserver", "reachable", tileServerUrl],
    queryFn: () => checkTileServerReachable(tileServerUrl),
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
