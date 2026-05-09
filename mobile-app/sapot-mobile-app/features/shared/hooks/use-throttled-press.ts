import { useCallback, useRef, useState } from "react";

type Handler = () => void | Promise<void>;

export function useThrottledPress(handler: Handler, delay = 300) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const onPress = useCallback(async () => {
    if (busyRef.current) return;

    const result = handlerRef.current();

    if (result instanceof Promise) {
      busyRef.current = true;
      setBusy(true);
      try {
        await result;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    } else {
      busyRef.current = true;
      setBusy(true);
      setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, delay);
    }
  }, [delay]);

  return { onPress, busy };
}
