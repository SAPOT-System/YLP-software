import { apiClient } from "./client";

export const searchUsers = async ({
  queryKey,
}: //   pageParam = 1,
{
  queryKey: [string, string];
  //   pageParam: number;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_key, username] = queryKey;

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
