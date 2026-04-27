import { useInfiniteQuery } from "@tanstack/react-query";
import { searchUsers } from "../api";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-user-search] module loaded");

const DEFAULT_LIMIT = 10;

export function useUserSearch(username: string, limit = DEFAULT_LIMIT) {
  hookLog.debug("[useUserSearch] init", {
    usernameLength: username.length,
    enabled: username.length > 2,
    limit,
  });
  return useInfiniteQuery({
    queryKey: ["userSearch", username, limit],
    queryFn: ({ pageParam }) =>
      searchUsers({ queryKey: ["userSearch", username, limit, pageParam as number] }),
    enabled: username.length > 2,
    staleTime: 1000 * 60 * 5,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextOffset = allPages.length * limit;
      return lastPage.length < limit ? undefined : nextOffset;
    },
  });
}
