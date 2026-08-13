import loadingTokens from "@/constants/loading";
import { useEffect, useRef, useState } from "react";

interface UseDelayedLoadingOptions {
  delay?: number;
  minDuration?: number;
  resetKey?: string | number;
}

/** Gates skeleton visibility to avoid fast-load flashes and slow-load strobes. */
export function useDelayedLoading(
  isLoading: boolean,
  options: UseDelayedLoadingOptions = {}
): boolean {
  const {
    delay = loadingTokens.skeletonDelay,
    minDuration = loadingTokens.skeletonMinDuration,
    resetKey,
  } = options;
  const [isVisible, setIsVisible] = useState(false);
  const isVisibleRef = useRef(false);
  const shownAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousLoadingRef = useRef(isLoading);
  const previousResetKeyRef = useRef(resetKey);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const resetChanged = previousResetKeyRef.current !== resetKey;
    const wasLoading = previousLoadingRef.current;
    previousLoadingRef.current = isLoading;
    previousResetKeyRef.current = resetKey;

    if (resetChanged) {
      clearTimer();
      shownAtRef.current = null;
      isVisibleRef.current = false;
      setIsVisible(false);
    }

    if (isLoading) {
      if (isVisibleRef.current) {
        if (!wasLoading) {
          clearTimer();
          shownAtRef.current = Date.now();
        }
        return clearTimer;
      }

      clearTimer();
      timerRef.current = setTimeout(() => {
        shownAtRef.current = Date.now();
        isVisibleRef.current = true;
        setIsVisible(true);
      }, delay);
      return clearTimer;
    }

    clearTimer();
    if (!isVisibleRef.current) return undefined;

    const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
    timerRef.current = setTimeout(() => {
      shownAtRef.current = null;
      isVisibleRef.current = false;
      setIsVisible(false);
    }, Math.max(0, minDuration - elapsed));
    return clearTimer;
  }, [delay, isLoading, minDuration, resetKey]);

  return isVisible;
}
