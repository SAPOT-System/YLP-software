import { apiClient } from "@/features/shared/api/client";
import { apiLog } from "@/features/shared/utils/logger";

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
