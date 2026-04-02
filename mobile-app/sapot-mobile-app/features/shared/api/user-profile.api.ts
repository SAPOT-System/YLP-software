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

export const updateProfileApi = async (credentials: {
  username?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
}) => {
  const payload = Object.fromEntries(
    Object.entries({
      username: credentials.username,
      first_name: credentials.firstName,
      last_name: credentials.lastName,
      phone_number: credentials.phoneNumber,
      email: credentials.email,
    }).filter(([, value]) => value !== undefined)
  );

  const res = await apiClient.post("/update/profile", payload);
  return res;
};

