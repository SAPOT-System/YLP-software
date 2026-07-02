import { useCallback, useEffect, useRef, useState } from "react";
import {
  LockoutKey,
  clearLockoutInfo,
  getLockoutInfo,
  saveLockoutInfo,
} from "@/features/shared/core/stores/secure-config";

interface LockoutTimerState {
  isLocked: boolean;
  secondsRemaining: number;
  deviceType: string | null;
  attemptsRemaining: number | null;
  setLock: (lockedUntilIso: string, deviceType: string, attemptsRemaining: number) => Promise<void>;
  clearLock: () => Promise<void>;
}

export function useLockoutTimer(storageKey: LockoutKey): LockoutTimerState {
  const [isLocked, setIsLocked] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [deviceType, setDeviceType] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(
    (until: Date) => {
      stopInterval();
      const tick = () => {
        const remaining = Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000));
        setSecondsRemaining(remaining);
        if (remaining === 0) {
          stopInterval();
          setIsLocked(false);
          setDeviceType(null);
          setAttemptsRemaining(null);
          clearLockoutInfo(storageKey).catch(() => {});
        }
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    },
    [storageKey, stopInterval]
  );

  useEffect(() => {
    getLockoutInfo(storageKey).then((info) => {
      if (!info) return;
      const until = new Date(info.lockedUntil);
      if (until > new Date()) {
        setIsLocked(true);
        setDeviceType(info.deviceType);
        setAttemptsRemaining(info.attemptsRemaining);
        startCountdown(until);
      } else {
        clearLockoutInfo(storageKey).catch(() => {});
      }
    });
    return stopInterval;
  }, [storageKey, startCountdown, stopInterval]);

  const setLock = useCallback(
    async (lockedUntilIso: string, dtype: string, remaining: number) => {
      await saveLockoutInfo(storageKey, lockedUntilIso, dtype, remaining);
      const until = new Date(lockedUntilIso);
      setIsLocked(true);
      setDeviceType(dtype);
      setAttemptsRemaining(remaining);
      startCountdown(until);
    },
    [storageKey, startCountdown]
  );

  const clearLock = useCallback(async () => {
    await clearLockoutInfo(storageKey);
    stopInterval();
    setIsLocked(false);
    setSecondsRemaining(0);
    setDeviceType(null);
    setAttemptsRemaining(null);
  }, [storageKey, stopInterval]);

  return { isLocked, secondsRemaining, deviceType, attemptsRemaining, setLock, clearLock };
}
