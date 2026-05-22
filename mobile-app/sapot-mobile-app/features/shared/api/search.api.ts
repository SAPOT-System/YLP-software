import { apiLog } from "@/features/shared/utils/logger";
import { apiClient } from "./client";
apiLog.debug("[search-api] module loaded");

type SearchUserResult = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_is_verified: boolean;
};

export const searchUsers = async ({
  queryKey,
}: {
  queryKey: [string, string, number, number];
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_key, username, limit, offset] = queryKey;

  apiLog.debug("api › search users", {
    hasUsername: Boolean(username?.trim()),
    usernameLength: username?.length ?? 0,
    limit,
    offset,
  });

  const res = await apiClient.post<{ res: SearchUserResult[] }>(
    "/user-utils/search-user",
    null,
    { params: { identifier_string: username, limit, offset } }
  );

  return res.data.res;
};

export const getUserById = async (
  user_id: string
): Promise<{
  id: string;
  first_name: string;
  username: string;
  last_name: string;
  phone_is_verified: boolean;
}> => {
  const res = await apiClient.get<{
    id: string;
    first_name: string;
    username: string;
    last_name: string;
    phone_is_verified: boolean;
  }>("/user-utils/search-user/{id}", {
    params: { user_id },
  });

  return res.data;
};
