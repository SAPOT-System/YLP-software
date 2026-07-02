import { useQuery } from "@tanstack/react-query";
import { gpsLog } from "@/features/shared/core/utils/logger";
import { getLatestLocationsApi } from "../api/gps.api";

const POLL_INTERVAL_MS = 5000;

export function useLatestLocations() {
  gpsLog.debug("[useLatestLocations] init");
  return useQuery({
    queryKey: ["gps", "latest"],
    queryFn: getLatestLocationsApi,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
  });
}
