import baseLogger from "@/features/shared/utils/logger";
import { apiClient } from "./client";

const apiLog = baseLogger.extend("api");
apiLog.debug("[user-profile-api] module loaded");

export const getUserApi = async (accessToken?: string) => {
  apiLog.debug("api › get user", { hasAccessToken: Boolean(accessToken) });
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
  apiLog.info("api › update profile", {
    hasUsername: Boolean(credentials.username),
    hasFirstName: Boolean(credentials.firstName),
    hasLastName: Boolean(credentials.lastName),
    hasPhoneNumber: Boolean(credentials.phoneNumber),
    hasEmail: Boolean(credentials.email),
  });
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
  apiLog.info("api › upload profile pic", {
    hasFileUri: Boolean(file?.uri),
    hasFileName: Boolean(file?.name),
    hasFileType: Boolean(file?.type),
  });
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
  apiLog.debug("api › get current profile pic");
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
  apiLog.debug("api › get user profile pic", { hasUserId: Boolean(userId) });
  const res = await apiClient.get<{
    url: string;
  }>(`/profile-picture/${userId}`);

  return res;
};
