import { useQuery } from '@tanstack/react-query';
import { getAnnouncements } from '../api';

const POLL_INTERVAL = 30_000;

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: getAnnouncements,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
  });
}
