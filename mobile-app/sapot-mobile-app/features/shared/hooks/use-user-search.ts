import { useQuery } from "@tanstack/react-query";
import { searchUsers } from "../api";

export function useUserSearch(username: string) {
  return useQuery({
    queryKey: ["userSearch", username],
    queryFn: searchUsers,
    enabled: username.length > 2,
    staleTime: 1000 * 60 * 5, // cache for 5 minutes
  });
}
