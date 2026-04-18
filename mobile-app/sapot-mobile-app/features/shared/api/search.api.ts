import { apiLog } from "@/features/shared/utils/logger";
import { apiClient } from "./client";
apiLog.debug("[search-api] module loaded");

export const searchUsers = async ({
  queryKey,
}: //   pageParam = 1,
{
  queryKey: [string, string];
  //   pageParam: number;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_key, username] = queryKey;

  apiLog.debug("api › search users", {
    hasUsername: Boolean(username?.trim()),
    usernameLength: username?.length ?? 0,
  });

  const res = await apiClient.post<{
    res: {
      first_name: string;
      username: string;
      last_name: string;
      id: string;
    }[];
  }>("/user-utils/search-user", null, {
    params: { username },
  });

  return res.data.res;
};

export const getUserById = async (
  user_id: string
): Promise<{
  id: string;
  first_name: string;
  username: string;
  last_name: string;
}> => {
  const res = await apiClient.get<{
    id: string;
    first_name: string;
    username: string;
    last_name: string;
  }>("/user-utils/search-user/{id}", {
    params: { user_id },
  });

  return res.data;
};
