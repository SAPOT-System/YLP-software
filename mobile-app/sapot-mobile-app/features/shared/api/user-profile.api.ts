import { apiClient } from "./client";

export const getUserApi = async (accessToken?: string) => {
  const res = await apiClient.get<{
    username: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    email: string;
    id: string;
  }>("/user-utils/current-user-info/", {
    headers: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : {},
  });
  return res.data;
};
