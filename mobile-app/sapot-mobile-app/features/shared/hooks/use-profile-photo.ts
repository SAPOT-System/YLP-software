import { getApiUrl } from "@/config/runtime";
import {
    getCurrentUserProfilePicApi,
    getUserProfilePicApi,
} from "@/features/shared/core/api/user-profile.api";
import { normalizeMediaUrl } from "@/features/shared/core/utils/normalize-media-url";
import { useCallback, useEffect, useMemo, useState } from "react";
import { photoLog } from "../core/utils/logger";
photoLog.debug("[use-profile-photo] module loaded");

type ProfilePhotoState = {
  url: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setUrl: (url: string | null) => void;
};

const photoCache = new Map<string, string>();
const listeners = new Map<string, Set<(url: string | null) => void>>();

const buildKey = (userId?: string | null) => (userId ? userId : "me");

const fetchProfilePhoto = async (userId?: string | null) => {
  photoLog.debug("profile-photo › fetch", { hasUserId: Boolean(userId) });
  const res = userId
    ? await getUserProfilePicApi(userId)
    : await getCurrentUserProfilePicApi();

  const url = normalizeMediaUrl(res.data?.url);
  return url ?? null;
};

const notifyListeners = (key: string, url: string | null) => {
  const target = listeners.get(key);
  if (!target) return;
  target.forEach((listener) => listener(url));
};

const getCache = (key: string) => photoCache.get(key) ?? null;

const setCache = (key: string, url: string | null) => {
  const normalized = normalizeMediaUrl(url);
  if (normalized) {
    photoCache.set(key, normalized);
  } else {
    photoCache.delete(key);
  }
  notifyListeners(key, normalized ?? null);
  return normalized ?? null;
};

export const useProfilePhoto = (userId?: string | null): ProfilePhotoState => {
  const key = useMemo(() => buildKey(userId), [userId]);
  const [url, setUrlState] = useState<string | null>(getCache(key));
  const [loading, setLoading] = useState(getCache(key) === null);
  const [error, setError] = useState<string | null>(null);

  const setUrl = useCallback(
    (nextUrl: string | null) => {
      const resolved = setCache(key, nextUrl);
      setUrlState(resolved);
    },
    [key]
  );

  const refresh = useCallback(async () => {
    if (userId === null) {
      photoLog.info("profile-photo › refresh skipped", { reason: "null user" });
      setLoading(false);
      setUrlState(null);
      return;
    }

    photoLog.info("profile-photo › refresh start", { hasUserId: Boolean(userId) });
    setLoading(true);
    setError(null);

    try {
      const nextUrl = await fetchProfilePhoto(userId);
      const resolved = setCache(key, nextUrl);
      setUrlState(resolved);
      photoLog.info("profile-photo › refresh success", {
        hasUrl: Boolean(resolved),
      });
    } catch (error) {
      photoLog.warn("profile-photo › refresh failed", { error });
      const baseUrl = getApiUrl();
      setError(`Failed to load profile photo. Check server: ${baseUrl}`);
      setUrlState(getCache(key));
    } finally {
      setLoading(false);
    }
  }, [key, userId]);

  useEffect(() => {
    const target = listeners.get(key) ?? new Set();
    target.add(setUrlState);
    listeners.set(key, target);

    return () => {
      const current = listeners.get(key);
      if (!current) return;
      current.delete(setUrlState);
      if (current.size === 0) {
        listeners.delete(key);
      }
    };
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { url, loading, error, refresh, setUrl };
};
