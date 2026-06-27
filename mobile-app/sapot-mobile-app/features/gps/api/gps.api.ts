import { apiClient } from "@/features/shared/core/api/client";
import { apiLog } from "@/features/shared/core/utils/logger";

export type UserLocation = {
  user_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  username: string;
};

export const getLatestLocationsApi = async (): Promise<UserLocation[]> => {
  apiLog.debug("api › gps latest locations");
  const res = await apiClient.get<UserLocation[]>("/gps/latest");
  return res.data;
};

export type GpsHistoryItem = {
  id: number;
  user_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
};

export const getGpsHistoryApi = async (
  userId: string,
  limit = 50
): Promise<GpsHistoryItem[]> => {
  apiLog.debug("api › gps history", { userId, limit });
  const res = await apiClient.get<GpsHistoryItem[]>(`/gps/history/${userId}`, {
    params: { limit },
  });
  return res.data;
};
