import { useCallback, useMemo } from 'react';
import { useAnnouncementSeen } from '../context/announcement-seen-context';
import { Announcement } from '../types';

export function useAnnouncementNewCount(announcements: Announcement[]) {
  const { seenIds, markAllSeen: markAllSeenRaw } = useAnnouncementSeen();

  const newCount = useMemo(
    () => announcements.filter((a) => !seenIds.has(a.id)).length,
    [announcements, seenIds]
  );

  const markAllSeen = useCallback(
    () => markAllSeenRaw(announcements.map((a) => a.id)),
    [announcements, markAllSeenRaw]
  );

  return { newCount, markAllSeen };
}
