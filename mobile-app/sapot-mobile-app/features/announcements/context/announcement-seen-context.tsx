import { getItemAsync, setItemAsync } from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const SEEN_IDS_KEY = 'announcements_seen_ids';

type AnnouncementSeenContextValue = {
  seenIds: Set<string>;
  markAllSeen: (ids: string[]) => Promise<void>;
};

const AnnouncementSeenContext = createContext<AnnouncementSeenContextValue | null>(null);

export function AnnouncementSeenProvider({ children }: { children: React.ReactNode }) {
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getItemAsync(SEEN_IDS_KEY).then((val) => {
      if (val) {
        try {
          setSeenIds(new Set(JSON.parse(val) as string[]));
        } catch {
          // corrupted or old format — start fresh
        }
      }
      setLoaded(true);
    });
  }, []);

  // Persist whenever seenIds changes, but only after initial load
  useEffect(() => {
    if (!loaded) return;
    setItemAsync(SEEN_IDS_KEY, JSON.stringify([...seenIds]));
  }, [seenIds, loaded]);

  const markAllSeen = useCallback(async (ids: string[]) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  return (
    <AnnouncementSeenContext.Provider value={{ seenIds, markAllSeen }}>
      {children}
    </AnnouncementSeenContext.Provider>
  );
}

export function useAnnouncementSeen() {
  const ctx = useContext(AnnouncementSeenContext);
  if (!ctx) throw new Error('useAnnouncementSeen must be used within AnnouncementSeenProvider');
  return ctx;
}
