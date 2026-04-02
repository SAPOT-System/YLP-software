import { apiClient } from "./client";

export const getUserApi = async (accessToken?: string) => {
  const res = await apiClient.get<{
    username: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    email: string;
    id: string;
    email_verified: boolean;
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

export type ExpoFileUpload = {
  uri: string;
  name: string;
  type: string;
};

export const uploadProfilePicApi = async (file: ExpoFileUpload) => {
  // eslint-disable-next-line no-undef
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const res = await apiClient.post<{
    message: string;
    photo_id: string;
    url: string;
  }>("/profile-picture/me", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
      Accept: "application/json",
    },
  });

  return res;
};

export const getCurrentUserProfilePicApi = async () => {
  const res = await apiClient.get<{
    url: string;
  }>("/profile-picture/me", {
    headers: {
      Accept: "application/json",
    },
  });

  return res;
};

export const getUserProfilePicApi = async (userId: string) => {
  const res = await apiClient.get<{
    url: string;
  }>("/profile-picture", { params: { user_id: userId } });

  return res;
};
