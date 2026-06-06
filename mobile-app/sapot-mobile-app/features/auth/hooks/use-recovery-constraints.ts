import { useQuery } from "@tanstack/react-query";
import { getRecoveryConstraintsApi, type RecoveryConstraints } from "@/features/auth/api/auth.api";

export const RECOVERY_CONSTRAINTS_QUERY_KEY = ["recovery-constraints"];

export function useRecoveryConstraints() {
  return useQuery<RecoveryConstraints>({
    queryKey: RECOVERY_CONSTRAINTS_QUERY_KEY,
    queryFn: getRecoveryConstraintsApi,
    staleTime: 60_000,
  });
}
