import { useQuery } from "@tanstack/react-query";
import { searchUsers } from "../api";
import { hookLog } from "../utils/logger";
hookLog.debug("[use-user-search] module loaded");

export function useUserSearch(username: string) {
  hookLog.debug("[useUserSearch] init", {
    usernameLength: username.length,
    enabled: username.length > 2,
  });
  return useQuery({
    queryKey: ["userSearch", username],
    queryFn: searchUsers,
    enabled: username.length > 2,
    staleTime: 1000 * 60 * 5, // cache for 5 minutes
  });
}
