import { useQuery } from "@tanstack/react-query";
import { getGpsHistoryApi } from "../api/gps.api";

export function useGpsHistory(userId: string | null) {
  return useQuery({
    queryKey: ["gps", "history", userId],
    queryFn: () => getGpsHistoryApi(userId!),
    enabled: false,
    retry: false,
    staleTime: 30_000,
  });
}
